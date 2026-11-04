import { createHash } from 'node:crypto';
import { Prisma, type OrderStatus } from '@prisma/client';
import { db } from './db.js';
import { calculateCost, orderTotal } from './calculations.js';
import { localDay } from './dates.js';
export type Tx = Prisma.TransactionClient;
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
export const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function operate(
  actorId: string,
  key: string,
  route: string,
  body: unknown,
  work: (tx: Tx) => Promise<unknown>,
) {
  const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return db.$transaction(
    async (tx) => {
      // Escritas operacionais compartilham uma trava transacional: não há leitura de saldo seguida de escrita concorrente.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(17938022)`;
      const prior = await tx.operationRequest.findUnique({ where: { id: key } });
      if (prior) {
        if (prior.actorId !== actorId || prior.route !== route || prior.requestHash !== requestHash)
          fail('Esta chave de operação já foi usada com outros dados.');
        return prior.result;
      }
      const result = json(await work(tx));
      await tx.operationRequest.create({ data: { id: key, actorId, route, requestHash, result } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: route,
          entity: 'Operation',
          entityId: key,
          metadata: json({ input: body }),
        },
      });
      return result;
    },
    { timeout: 60000, maxWait: 15000 },
  );
}
export async function freeMilk(tx: Tx, until = new Date()) {
  const receipts = await tx.milkReceipt.findMany({
    where: { approved: true, date: { lte: until } },
    include: { sources: true, producer: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  return receipts
    .map((r) => ({
      ...r,
      available: D(r.liters).minus(r.sources.reduce((sum, s) => sum.plus(s.liters), D(0))),
    }))
    .filter((r) => r.available.gt(0));
}
export async function recostMonth(tx: Tx, date: Date) {
  const month = localDay(date).slice(0, 7);
  const start = new Date(`${month}-01T00:00:00-03:00`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const [orders, fixed] = await Promise.all([
    tx.productionOrder.findMany({
      where: { date: { gte: start, lt: end } },
      include: { product: true },
    }),
    tx.fixedCost.aggregate({ where: { month }, _sum: { amount: true } }),
  ]);
  const weight = orders.reduce(
    (s, p) => s.plus(D(p.quantityProduced).mul(p.product.kgPerUnit)),
    D(0),
  );
  if (weight.isZero()) return;
  for (const p of orders) {
    const overhead = D(fixed._sum.amount ?? 0)
      .mul(p.quantityProduced)
      .mul(p.product.kgPerUnit)
      .div(weight)
      .toDecimalPlaces(2);
    const total = p.milkCost.plus(p.supplyCost).plus(overhead).plus(p.lossCost);
    await tx.productionOrder.update({
      where: { id: p.id },
      data: { overheadCost: overhead, totalCost: total },
    });
    await tx.batch.updateMany({
      where: { productionId: p.id },
      data: { unitCost: total.div(p.quantityProduced).toDecimalPlaces(4) },
    });
  }
}
export async function produce(
  tx: Tx,
  actorId: string,
  input: {
    productId: string;
    liters: number;
    quantity: number;
    status: 'RELEASED' | 'MATURING' | 'IN_PRODUCTION';
    notes?: string;
    receiptIds?: string[];
  },
) {
  const product = await tx.product.findFirstOrThrow({
    where: { id: input.productId, deletedAt: null },
    include: { recipes: { include: { supply: true } } },
  });
  const date = new Date();
  let remaining = D(input.liters);
  const sources: { receiptId: string; liters: Prisma.Decimal }[] = [];
  const milkCosts: { liters: string; price: string }[] = [];
  const availableMilk = await freeMilk(tx, date);
  if (input.receiptIds && input.receiptIds.some((id) => !availableMilk.some((r) => r.id === id)))
    fail('Um recebimento selecionado não possui leite aprovado disponível.');
  for (const r of availableMilk.filter(
    (r) => !input.receiptIds || input.receiptIds.includes(r.id),
  )) {
    const take = Prisma.Decimal.min(remaining, r.available);
    sources.push({ receiptId: r.id, liters: take });
    milkCosts.push({ liters: take.toString(), price: r.pricePerLiter.toString() });
    remaining = remaining.minus(take);
    if (remaining.lte(0)) break;
  }
  if (remaining.gt(0)) fail(`Leite aprovado insuficiente. Faltam ${remaining.toFixed(3)} litros.`);
  if (!product.recipes.length) fail('Cadastre a ficha técnica antes de produzir.');
  const uses: {
    supplyId: string;
    purchaseId: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
  }[] = [];
  for (const item of product.recipes) {
    let needed = item.quantityPerUnit.mul(input.quantity).toDecimalPlaces(5);
    if (needed.lte(0))
      fail(
        'Consumo abaixo da precisão do estoque. Ajuste a unidade do insumo ou a quantidade produzida.',
        400,
      );
    if (item.supply.stock.lt(needed)) fail(`Estoque insuficiente de ${item.supply.name}.`);
    const purchases = await tx.supplyPurchase.findMany({
      where: { supplyId: item.supplyId, OR: [{ expiresAt: null }, { expiresAt: { gt: date } }] },
      include: { uses: true },
      orderBy: [{ expiresAt: 'asc' }, { date: 'asc' }, { id: 'asc' }],
    });
    for (const p of purchases) {
      const left = p.quantity.minus(p.uses.reduce((s, u) => s.plus(u.quantity), D(0)));
      if (left.lte(0)) continue;
      const take = Prisma.Decimal.min(needed, left);
      uses.push({
        supplyId: item.supplyId,
        purchaseId: p.id,
        quantity: take,
        unitCost: p.unitCost,
      });
      needed = needed.minus(take);
      if (needed.lte(0)) break;
    }
    if (needed.gt(0))
      fail(
        `Compras válidas insuficientes para ${item.supply.name}. Registre uma entrada de estoque.`,
      );
    const consumed = item.quantityPerUnit.mul(input.quantity).toDecimalPlaces(5);
    await tx.supply.update({
      where: { id: item.supplyId },
      data: { stock: { decrement: consumed } },
    });
  }
  const cost = calculateCost({
    milk: milkCosts,
    supplies: uses.map((u) => ({
      quantity: u.quantity.toString(),
      unitCost: u.unitCost.toString(),
    })),
    monthlyFixed: 0,
    monthlyProduction: input.quantity,
    quantity: input.quantity,
    liters: input.liters,
    losses: 0,
    salePrice: product.salePrice.toString(),
  });
  if (D(cost.perUnit.toString()).gt('99999999.9999'))
    fail('Custo por unidade muito alto. Confira litros e quantidade produzida.', 400);
  const production = await tx.productionOrder.create({
    data: {
      productId: product.id,
      date,
      litersUsed: input.liters,
      quantityProduced: input.quantity,
      responsibleId: actorId,
      notes: input.notes,
      milkCost: cost.milk.toString(),
      supplyCost: cost.supplies.toString(),
      overheadCost: 0,
      lossCost: 0,
      totalCost: cost.total.toString(),
      sources: { create: sources },
      supplies: { create: uses },
    },
  });
  const day = localDay(date);
  const start = new Date(`${day}T00:00:00-03:00`);
  const sequence = await tx.batch.count({
    where: {
      productId: product.id,
      manufacturedAt: { gte: start, lt: new Date(+start + 86400000) },
    },
  });
  const code = `${product.code}-${day.replaceAll('-', '')}-${String(sequence + 1).padStart(3, '0')}`;
  const batch = await tx.batch.create({
    data: {
      code,
      productId: product.id,
      productionId: production.id,
      manufacturedAt: date,
      expiresAt: new Date(+date + product.shelfLifeDays * 86400000),
      status: input.status,
      initialQuantity: input.quantity,
      availableQuantity: input.quantity,
      unitCost: cost.perUnit.toString(),
    },
  });
  await tx.stockMovement.create({
    data: {
      batchId: batch.id,
      type: 'PRODUCTION',
      quantity: input.quantity,
      reference: production.id,
      reason: 'Entrada de produção',
    },
  });
  for (const use of uses)
    await tx.stockMovement.create({
      data: {
        supplyId: use.supplyId,
        type: 'PRODUCTION',
        quantity: use.quantity.negated(),
        reference: production.id,
        reason: 'Consumo na produção',
      },
    });
  await recostMonth(tx, date);
  return tx.batch.findUniqueOrThrow({
    where: { id: batch.id },
    include: { product: true, production: true },
  });
}
export interface OrderInput {
  customerId: string;
  deliveryDate: string;
  paymentMethod: string;
  notes?: string;
  items: { productId: string; quantity: number; unitPrice?: number }[];
  status: 'NEW' | 'CONFIRMED';
}
export async function reserve(
  tx: Tx,
  items: { productId: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal }[],
  deliveryDate: Date,
) {
  const allocations: Prisma.OrderItemCreateWithoutOrderInput[] = [];
  for (const item of items) {
    let remaining = D(item.quantity);
    const batches = await tx.batch.findMany({
      where: {
        productId: item.productId,
        status: 'RELEASED',
        expiresAt: { gt: new Date(Math.max(+new Date(), +deliveryDate)) },
        availableQuantity: { gt: 0 },
      },
      orderBy: [{ expiresAt: 'asc' }, { manufacturedAt: 'asc' }, { id: 'asc' }],
    });
    for (const b of batches) {
      const free = b.availableQuantity.minus(b.reservedQuantity);
      if (free.lte(0)) continue;
      const take = Prisma.Decimal.min(remaining, free);
      await tx.batch.update({
        where: { id: b.id },
        data: { reservedQuantity: { increment: take } },
      });
      allocations.push({
        product: { connect: { id: item.productId } },
        batch: { connect: { id: b.id } },
        quantity: take,
        unitPrice: item.unitPrice,
        discount: 0,
      });
      remaining = remaining.minus(take);
      if (remaining.lte(0)) break;
    }
    if (remaining.gt(0)) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
      fail(
        `Sem estoque liberado com validade para a entrega de ${p.name}. Faltam ${remaining.toString()} ${p.unit}.`,
      );
    }
  }
  return allocations;
}
export async function release(tx: Tx, orderId: string) {
  for (const item of await tx.orderItem.findMany({ where: { orderId, batchId: { not: null } } }))
    await tx.batch.update({
      where: { id: item.batchId! },
      data: { reservedQuantity: { decrement: item.quantity } },
    });
}
export async function saveOrder(
  tx: Tx,
  actorId: string,
  input: OrderInput,
  orderId?: string,
  recurring?: { id: string; key: string },
) {
  const customer = await tx.customer.findFirstOrThrow({
    where: { id: input.customerId, deletedAt: null, status: 'ACTIVE' },
    include: { prices: true },
  });
  const current = orderId ? await tx.order.findUniqueOrThrow({ where: { id: orderId } }) : null;
  if (current && !['NEW', 'CONFIRMED'].includes(current.status))
    fail('Só pedidos novos ou confirmados podem ser editados.');
  const deliveryDate = new Date(input.deliveryDate);
  if (+deliveryDate < +new Date() - 86400000) fail('A entrega não pode estar no passado.', 400);
  const items = [];
  for (const item of input.items) {
    const product = await tx.product.findFirstOrThrow({
      where: { id: item.productId, deletedAt: null },
    });
    const price = D(
      item.unitPrice ??
        customer.prices.find((p) => p.productId === item.productId)?.price ??
        product.salePrice,
    );
    items.push({ productId: item.productId, quantity: D(item.quantity), unitPrice: price });
  }
  const total = D(
    orderTotal(
      items.map((i) => ({ quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString() })),
    ).toString(),
  );
  if (input.status === 'CONFIRMED' && customer.creditLimit.gt(0)) {
    const receivables = await tx.receivable.findMany({
      where: { order: { customerId: customer.id } },
    });
    const debt = receivables.reduce((s, r) => s.plus(r.amount.minus(r.paidAmount)), D(0));
    const open = await tx.order.aggregate({
      where: {
        customerId: customer.id,
        status: { notIn: ['DELIVERED', 'CANCELLED'] },
        ...(orderId ? { id: { not: orderId } } : {}),
      },
      _sum: { total: true },
    });
    if (
      debt
        .plus(open._sum.total ?? 0)
        .plus(total)
        .gt(customer.creditLimit)
    )
      fail('O limite de crédito do cliente foi excedido. Revise o cadastro ou os pagamentos.');
  }
  if (current) {
    if (current.status === 'CONFIRMED') await release(tx, current.id);
    await tx.orderItem.deleteMany({ where: { orderId: current.id } });
  }
  const allocations =
    input.status === 'CONFIRMED'
      ? await reserve(tx, items, deliveryDate)
      : items.map((i) => ({
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          product: { connect: { id: i.productId } },
        }));
  if (total.gt('999999999999.99')) fail('O valor do pedido excede o limite suportado.', 400);
  const data = {
    customerId: customer.id,
    deliveryDate,
    status: input.status,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    total,
    items: { create: allocations },
    history: { create: { status: input.status, actorName: actorId } },
  };
  if (current)
    return tx.order.update({ where: { id: current.id }, data, include: { items: true } });
  return tx.order.create({
    data: {
      ...data,
      code: `PED-${((await tx.order.count()) + 1).toString().padStart(6, '0')}`,
      ...(recurring ? { recurringOrderId: recurring.id, occurrenceKey: recurring.key } : {}),
    },
    include: { items: true },
  });
}
export const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PICKING', 'CANCELLED'],
  PICKING: ['READY', 'CANCELLED'],
  READY: ['CANCELLED'],
  IN_ROUTE: ['CANCELLED'],
};
