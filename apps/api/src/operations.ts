import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from './db.js';
import { authenticate, authorize } from './auth.js';
import { allowed, type Permission } from './permissions.js';
import {
  operate,
  produce,
  saveOrder,
  release,
  transitions,
  freeMilk,
  D,
  fail,
  type Tx,
} from './operations-core.js';
import { dateRange } from './dates.js';
const id = z.string().min(1).max(100);
const money = z.number().finite().min(0).max(1e8).multipleOf(0.01);
const qty = z.number().finite().positive().max(9999999.999).multipleOf(0.001);
const name = z.string().trim().min(2).max(150);
const producerSchema = z
  .object({
    name,
    farm: name,
    city: name,
    phone: z.string().trim().max(30),
    document: z.string().trim().min(3).max(40),
    pricePerLiter: z.number().finite().min(0).max(100).multipleOf(0.0001),
    qualityBonus: z.number().min(0).max(10).multipleOf(0.0001).default(0),
    active: z.boolean().default(true),
  })
  .strict();
const productSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9-]{2,15}$/),
    name,
    unit: z.enum(['kg', 'L', 'un']),
    category: name,
    salePrice: money,
    shelfLifeDays: z.number().int().min(1).max(730),
    minimumStock: z.number().min(0).max(1e6),
    expectedLitersPerUnit: z.number().positive().max(1000),
    kgPerUnit: z.number().positive().max(100).multipleOf(0.0001).default(1),
    recipes: z
      .array(
        z
          .object({
            supplyId: id,
            quantityPerUnit: z.number().positive().max(1e4).multipleOf(0.00001),
          })
          .strict(),
      )
      .max(30)
      .default([]),
  })
  .strict();
const customerSchema = z
  .object({
    name,
    type: z.enum(['MARKET', 'BAKERY', 'RESTAURANT', 'EMPORIUM', 'CONSUMER']),
    document: z.string().min(3).max(40),
    address: name,
    neighborhood: name,
    city: name,
    contact: name,
    phone: z.string().min(8).max(30),
    paymentTermDays: z.number().int().min(0).max(120),
    creditLimit: money,
    status: z.enum(['ACTIVE', 'INACTIVE', 'DELINQUENT']).default('ACTIVE'),
    routeId: id.nullable().optional(),
    notes: z.string().max(1000).optional(),
    prices: z
      .array(z.object({ productId: id, price: money }).strict())
      .max(100)
      .default([]),
  })
  .strict();
const receiptSchema = z
  .object({
    producerId: id,
    liters: qty,
    temperature: z.number().min(0).max(50),
    acidity: z.number().min(0).max(100),
    fat: z.number().min(0).max(20),
    protein: z.number().min(0).max(20),
    scc: z.number().int().min(0).max(1e8),
    approved: z.boolean(),
    date: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
const productionSchema = z
  .object({
    productId: id,
    liters: qty,
    quantity: qty,
    status: z.enum(['RELEASED', 'MATURING', 'IN_PRODUCTION']).default('IN_PRODUCTION'),
    notes: z.string().max(1000).optional(),
    receiptIds: z.array(id).min(1).max(50).optional(),
  })
  .strict();
const orderSchema = z
  .object({
    customerId: id,
    deliveryDate: z.string().datetime({ offset: true }),
    paymentMethod: z.enum(['PIX', 'BOLETO', 'CASH', 'CARD']),
    status: z.enum(['NEW', 'CONFIRMED']).default('CONFIRMED'),
    notes: z.string().max(1000).optional(),
    items: z
      .array(z.object({ productId: id, quantity: qty, unitPrice: money.optional() }).strict())
      .min(1)
      .max(30),
  })
  .strict();
export const requestId = (request: FastifyRequest) =>
  z.string().uuid('Informe uma chave única de operação.').parse(request.headers['idempotency-key']);
const paramId = (request: FastifyRequest) => z.object({ id }).strict().parse(request.params).id;
const mutation = (
  request: FastifyRequest,
  path: string,
  body: unknown,
  work: (tx: Tx) => Promise<unknown>,
) => operate(request.viewer.id, requestId(request), path, body, work);
const receiptQuality = async (tx: Tx, input: z.infer<typeof receiptSchema>) => {
  const company = await tx.company.findFirstOrThrow();
  const p = z
    .object({
      maxTemperature: z.number(),
      minAcidity: z.number(),
      maxAcidity: z.number(),
      maxScc: z.number(),
      minFat: z.number().default(2.8),
      minProtein: z.number().default(2.9),
    })
    .parse(company.qualityParameters);
  if (
    input.approved &&
    (input.temperature > p.maxTemperature ||
      input.acidity < p.minAcidity ||
      input.acidity > p.maxAcidity ||
      input.scc > p.maxScc ||
      input.fat < p.minFat ||
      input.protein < p.minProtein)
  )
    fail('A amostra está fora dos parâmetros da empresa. Registre como reprovada.', 400);
};
export async function operationalRoutes(app: FastifyInstance) {
  app.get('/api/ops/lookups', { preHandler: authenticate }, async (request) => {
    if (request.viewer.role === 'DRIVER') fail('Acesso restrito.', 403);
    const p = request.viewer.permissions;
    return {
      milkReceipts: p.includes('receipts')
        ? (await freeMilk(db)).map((r) => ({
            id: r.id,
            name: `${r.producer.name} · ${r.available.toFixed(1)} L · ${r.date.toLocaleDateString('pt-BR')}`,
          }))
        : [],
      producers: p.includes('producers')
        ? await db.producer.findMany({
            where: { active: true, deletedAt: null },
            orderBy: { name: 'asc' },
            take: 1000,
          })
        : [],
      products:
        p.includes('products') || p.includes('orders')
          ? await db.product.findMany({
              where: { deletedAt: null },
              select: { id: true, name: true, unit: true, salePrice: true },
              orderBy: { name: 'asc' },
              take: 1000,
            })
          : [],
      supplies: p.includes('supplies')
        ? await db.supply.findMany({
            where: { deletedAt: null },
            orderBy: { name: 'asc' },
            take: 1000,
          })
        : [],
      customers: p.includes('customers')
        ? await db.customer.findMany({
            where: { deletedAt: null },
            include: { prices: true },
            orderBy: { name: 'asc' },
            take: 1000,
          })
        : [],
      routes: p.includes('deliveries') ? await db.route.findMany() : [],
      vehicles: p.includes('deliveries') ? await db.vehicle.findMany() : [],
      drivers:
        request.viewer.role === 'OWNER'
          ? await db.user.findMany({
              where: { active: true, role: { key: 'DRIVER' } },
              select: { id: true, name: true },
            })
          : [],
    };
  });
  app.get('/api/ops/:resource/:id', { preHandler: authenticate }, async (request) => {
    const { resource, id: recordId } = z
      .object({
        resource: z.enum([
          'producers',
          'receipts',
          'products',
          'customers',
          'orders',
          'batches',
          'supplies',
        ]),
        id,
      })
      .strict()
      .parse(request.params);
    if (!allowed(request.viewer.role, resource as Permission))
      fail('Seu papel não permite esta consulta.', 403);
    switch (resource) {
      case 'producers': {
        const producer = await db.producer.findUniqueOrThrow({
          where: { id: recordId },
          include: {
            receipts: { orderBy: { date: 'desc' }, take: 100, include: { sources: true } },
          },
        });
        const allReceipts = await db.milkReceipt.findMany({
          where: { producerId: recordId },
          select: { id: true },
        });
        const payables = await db.payable.findMany({
          where: { reference: { in: [recordId, ...allReceipts.map((r) => r.id)] } },
          orderBy: { dueDate: 'desc' },
          take: 500,
        });
        return { ...producer, payables };
      }
      case 'receipts':
        return db.milkReceipt.findUniqueOrThrow({
          where: { id: recordId },
          include: { producer: true, sources: true },
        });
      case 'products':
        return db.product.findUniqueOrThrow({
          where: { id: recordId },
          include: {
            recipes: { include: { supply: true } },
            batches: { take: 10, orderBy: { manufacturedAt: 'desc' } },
          },
        });
      case 'customers':
        return db.customer.findUniqueOrThrow({
          where: { id: recordId },
          include: {
            prices: true,
            orders: { take: 30, orderBy: { createdAt: 'desc' }, include: { receivable: true } },
          },
        });
      case 'orders':
        return db.order.findUniqueOrThrow({
          where: { id: recordId },
          include: {
            items: { include: { product: true, batch: true } },
            customer: true,
            history: { orderBy: { date: 'asc' } },
            delivery: true,
            receivable: true,
          },
        });
      case 'batches':
        return db.batch.findUniqueOrThrow({
          where: { id: recordId },
          include: {
            product: true,
            production: {
              include: {
                sources: { include: { receipt: { include: { producer: true } } } },
                supplies: { include: { supply: true, purchase: true } },
              },
            },
            movements: { orderBy: { date: 'desc' } },
          },
        });
      case 'supplies':
        return db.supply.findUniqueOrThrow({
          where: { id: recordId },
          include: {
            purchases: { orderBy: { date: 'desc' }, take: 30 },
            movements: { orderBy: { date: 'desc' }, take: 100 },
          },
        });
    }
  });
  for (const method of ['POST', 'PUT'] as const) {
    app.route({
      method,
      url: method === 'POST' ? '/api/producers' : '/api/producers/:id',
      preHandler: authorize('producers'),
      handler: async (request, reply) => {
        const data = producerSchema.parse(request.body);
        const recordId = method === 'PUT' ? paramId(request) : undefined;
        const result = await mutation(
          request,
          `${method}:producer:${recordId ?? ''}`,
          data,
          (tx) =>
            recordId
              ? tx.producer.update({ where: { id: recordId }, data })
              : tx.producer.create({ data }),
        );
        return reply.code(method === 'POST' ? 201 : 200).send(result);
      },
    });
    app.route({
      method,
      url: method === 'POST' ? '/api/products' : '/api/products/:id',
      preHandler: authorize('products'),
      handler: async (request, reply) => {
        const { recipes, ...data } = productSchema.parse(request.body);
        const recordId = method === 'PUT' ? paramId(request) : undefined;
        if (new Set(recipes.map((r) => r.supplyId)).size !== recipes.length)
          fail('Não repita um insumo na receita.', 400);
        const result = await mutation(
          request,
          `${method}:product:${recordId ?? ''}`,
          request.body,
          async (tx) => {
            if (recordId) {
              const current = await tx.product.findUniqueOrThrow({ where: { id: recordId } });
              if (
                (current.unit !== data.unit || !current.kgPerUnit.eq(data.kgPerUnit)) &&
                (await tx.productionOrder.count({ where: { productId: recordId } }))
              )
                fail('Unidade e fator de peso não podem mudar após uma produção.');
              await tx.recipeItem.deleteMany({ where: { productId: recordId } });
              return tx.product.update({
                where: { id: recordId },
                data: { ...data, recipes: { create: recipes } },
                include: { recipes: true },
              });
            }
            return tx.product.create({
              data: { ...data, recipes: { create: recipes } },
              include: { recipes: true },
            });
          },
        );
        return reply.code(method === 'POST' ? 201 : 200).send(result);
      },
    });
    app.route({
      method,
      url: method === 'POST' ? '/api/customers' : '/api/customers/:id',
      preHandler: authorize('customers'),
      handler: async (request, reply) => {
        const { prices, ...data } = customerSchema.parse(request.body);
        if (new Set(prices.map((p) => p.productId)).size !== prices.length)
          fail('Não repita um produto na tabela de preços.', 400);
        const recordId = method === 'PUT' ? paramId(request) : undefined;
        const result = await mutation(
          request,
          `${method}:customer:${recordId ?? ''}`,
          request.body,
          async (tx) => {
            if (recordId) {
              await tx.customerPrice.deleteMany({ where: { customerId: recordId } });
              return tx.customer.update({
                where: { id: recordId },
                data: { ...data, prices: { create: prices } },
              });
            }
            return tx.customer.create({ data: { ...data, prices: { create: prices } } });
          },
        );
        return reply.code(method === 'POST' ? 201 : 200).send(result);
      },
    });
  }
  for (const resource of ['producers', 'products', 'customers'] as const)
    app.delete(`/api/${resource}/:id`, { preHandler: authorize(resource) }, async (request) => {
      const recordId = paramId(request);
      return mutation(request, `ARCHIVE:${resource}:${recordId}`, {}, async (tx) => {
        const data = { deletedAt: new Date() };
        if (resource === 'producers')
          return tx.producer.update({ where: { id: recordId }, data: { ...data, active: false } });
        if (resource === 'products') return tx.product.update({ where: { id: recordId }, data });
        return tx.customer.update({
          where: { id: recordId },
          data: { ...data, status: 'INACTIVE' },
        });
      });
    });
  app.post('/api/receipts', { preHandler: authorize('receipts') }, async (request, reply) => {
    const input = receiptSchema.parse(request.body);
    const result = await mutation(request, 'CREATE_RECEIPT', input, async (tx) => {
      await receiptQuality(tx, input);
      const date = input.date ? new Date(input.date) : new Date();
      if (+date > Date.now() + 60000) fail('O recebimento não pode ser futuro.', 400);
      const producer = await tx.producer.findFirstOrThrow({
        where: { id: input.producerId, active: true, deletedAt: null },
      });
      const receipt = await tx.milkReceipt.create({
        data: {
          ...input,
          date,
          pricePerLiter: producer.pricePerLiter.plus(producer.qualityBonus),
          responsibleId: request.viewer.id,
        },
      });
      if (receipt.approved)
        await tx.payable.create({
          data: {
            description: `Leite — ${producer.name}`,
            category: 'MILK',
            amount: receipt.liters.mul(receipt.pricePerLiter).toDecimalPlaces(2),
            dueDate: new Date(+date + 30 * 86400000),
            reference: receipt.id,
          },
        });
      return receipt;
    });
    return reply.code(201).send(result);
  });
  app.patch('/api/receipts/:id/quality', { preHandler: authorize('receipts') }, async (request) => {
    const recordId = paramId(request);
    const { approved } = z.object({ approved: z.boolean() }).strict().parse(request.body);
    return mutation(request, `RECEIPT_QUALITY:${recordId}`, { approved }, async (tx) => {
      const receipt = await tx.milkReceipt.findUniqueOrThrow({
        where: { id: recordId },
        include: { sources: true, producer: true },
      });
      if (receipt.sources.length)
        fail(
          'Este leite já foi consumido. Bloqueie os lotes envolvidos em vez de alterar a origem.',
        );
      await receiptQuality(tx, {
        producerId: receipt.producerId,
        liters: Number(receipt.liters),
        temperature: Number(receipt.temperature),
        acidity: Number(receipt.acidity),
        fat: Number(receipt.fat),
        protein: Number(receipt.protein),
        scc: receipt.scc,
        approved,
      });
      const payables = await tx.payable.findMany({ where: { reference: recordId } });
      if (
        !payables.length &&
        (await tx.payable.count({ where: { reference: receipt.producerId, category: 'MILK' } }))
      )
        fail('Este recebimento pertence a um fechamento consolidado e não pode ser alterado.');
      if (payables.some((p) => p.paidAmount.gt(0)))
        fail('O recebimento tem pagamento registrado. Faça o estorno financeiro antes de alterar.');
      await tx.payable.deleteMany({ where: { reference: recordId } });
      if (approved)
        await tx.payable.create({
          data: {
            description: `Leite — ${receipt.producer.name}`,
            category: 'MILK',
            amount: receipt.liters.mul(receipt.pricePerLiter).toDecimalPlaces(2),
            dueDate: new Date(+receipt.date + 30 * 86400000),
            reference: recordId,
          },
        });
      return tx.milkReceipt.update({ where: { id: recordId }, data: { approved } });
    });
  });
  app.get('/api/milk-balance', { preHandler: authorize('receipts') }, async () => {
    const rows = await freeMilk(db);
    return {
      availableLiters: rows.reduce((s, r) => s.plus(r.available), D(0)),
      rows: rows.map((r) => ({
        id: r.id,
        producer: r.producer.name,
        date: r.date,
        available: r.available,
        liters: r.liters,
      })),
    };
  });
  app.post('/api/production', { preHandler: authorize('batches') }, async (request, reply) => {
    const input = productionSchema.parse(request.body);
    return reply
      .code(201)
      .send(
        await mutation(request, 'PRODUCE', input, (tx) => produce(tx, request.viewer.id, input)),
      );
  });
  app.patch('/api/batches/:id/status', { preHandler: authorize('batches') }, async (request) => {
    const recordId = paramId(request);
    const input = z
      .object({
        status: z.enum(['RELEASED', 'MATURING', 'BLOCKED']),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(request.body);
    return mutation(request, `BATCH_STATUS:${recordId}`, input, async (tx) => {
      const batch = await tx.batch.findUniqueOrThrow({ where: { id: recordId } });
      if (batch.expiresAt <= new Date() && input.status !== 'BLOCKED')
        fail('Lotes vencidos não podem ser liberados.');
      if (batch.availableQuantity.lte(0) && input.status !== 'BLOCKED')
        fail('Este lote não possui saldo.');
      return tx.batch.update({ where: { id: recordId }, data: { status: input.status } });
    });
  });
  app.post('/api/orders', { preHandler: authorize('orders') }, async (request, reply) => {
    const input = orderSchema.parse(request.body);
    return reply
      .code(201)
      .send(
        await mutation(request, 'CREATE_ORDER', input, (tx) =>
          saveOrder(tx, request.viewer.id, input),
        ),
      );
  });
  app.put('/api/orders/:id', { preHandler: authorize('orders') }, async (request) => {
    const recordId = paramId(request);
    const input = orderSchema.parse(request.body);
    return mutation(request, `EDIT_ORDER:${recordId}`, input, (tx) =>
      saveOrder(tx, request.viewer.id, input, recordId),
    );
  });
  app.patch('/api/orders/:id/status', { preHandler: authorize('orders') }, async (request) => {
    const recordId = paramId(request);
    const { status } = z
      .object({ status: z.nativeEnum(OrderStatus) })
      .strict()
      .parse(request.body);
    return mutation(request, `ORDER_STATUS:${recordId}`, { status }, async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: recordId },
        include: { items: true },
      });
      if (!transitions[order.status]?.includes(status))
        fail('Esta mudança de situação não é permitida.');
      if (status === 'CANCELLED' && order.status !== 'NEW') await release(tx, recordId);
      if (status === 'CONFIRMED') {
        const input = {
          customerId: order.customerId,
          deliveryDate: order.deliveryDate.toISOString(),
          paymentMethod: order.paymentMethod,
          notes: order.notes ?? undefined,
          status: 'CONFIRMED' as const,
          items: order.items.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
          })),
        };
        return saveOrder(tx, request.viewer.id, input, recordId);
      }
      return tx.order.update({
        where: { id: recordId },
        data: { status, history: { create: { status, actorName: request.viewer.name } } },
      });
    });
  });
  app.post('/api/orders/:id/dispatch', { preHandler: authorize('orders') }, async (request) => {
    if (request.viewer.role !== 'OWNER')
      fail('Somente o gestor pode atribuir rotas e motoristas.', 403);
    const recordId = paramId(request);
    const input = z
      .object({ routeId: id, vehicleId: id, driverId: id })
      .strict()
      .parse(request.body);
    return mutation(request, `DISPATCH:${recordId}`, input, async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: recordId },
        include: { items: { include: { batch: true, product: true } } },
      });
      if (order.status !== 'READY') fail('O pedido precisa estar pronto antes da saída.');
      for (const i of order.items)
        if (!i.batch || i.batch.status !== 'RELEASED' || i.batch.expiresAt <= new Date())
          fail('Há lote bloqueado, vencido ou sem reserva neste pedido.');
      await tx.user.findFirstOrThrow({
        where: { id: input.driverId, active: true, role: { key: 'DRIVER' } },
      });
      const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
      const today = dateRange({ period: 'today' });
      const assigned = await tx.delivery.findMany({
        where: {
          vehicleId: input.vehicleId,
          scheduledAt: { gte: today.start, lt: today.end },
          order: { status: 'IN_ROUTE' },
        },
        include: { order: { include: { items: { include: { product: true } } } } },
      });
      const weight = order.items
        .reduce((s, i) => s.plus(i.quantity.mul(i.product.kgPerUnit)), D(0))
        .plus(
          assigned.reduce(
            (s, d) =>
              s.plus(
                d.order.items.reduce((t, i) => t.plus(i.quantity.mul(i.product.kgPerUnit)), D(0)),
              ),
            D(0),
          ),
        );
      if (weight.gt(vehicle.capacityKg)) fail('A capacidade do veículo foi excedida.');
      const delivery = await tx.delivery.create({
        data: {
          orderId: recordId,
          ...input,
          scheduledAt: new Date(),
          stopNumber: assigned.length + 1,
          events: { create: { type: 'DISPATCHED', description: 'Pedido saiu para entrega.' } },
        },
      });
      await tx.order.update({
        where: { id: recordId },
        data: {
          status: 'IN_ROUTE',
          history: { create: { status: 'IN_ROUTE', actorName: request.viewer.name } },
        },
      });
      return delivery;
    });
  });
  app.post(
    '/api/deliveries/:id/complete',
    { preHandler: authorize('deliveries') },
    async (request) => {
      const recordId = paramId(request);
      const input = z
        .object({
          signature: z.string().trim().min(2).max(150),
          notes: z.string().max(1000).optional(),
        })
        .strict()
        .parse(request.body);
      return mutation(request, `COMPLETE_DELIVERY:${recordId}`, input, async (tx) => {
        const d = await tx.delivery.findUniqueOrThrow({
          where: { id: recordId },
          include: { order: { include: { customer: true, items: { include: { batch: true } } } } },
        });
        if (request.viewer.role !== 'OWNER' && request.viewer.role !== 'DRIVER')
          fail('Seu papel permite apenas consultar entregas.', 403);
        if (request.viewer.role === 'DRIVER') {
          const day = dateRange({ period: 'today' });
          if (
            d.driverId !== request.viewer.id ||
            d.scheduledAt < day.start ||
            d.scheduledAt >= day.end
          )
            fail('Você só pode concluir suas próprias entregas do dia.', 403);
        }
        if (d.order.status !== 'IN_ROUTE' || d.deliveredAt)
          fail('Esta entrega já foi concluída ou não está em rota.');
        for (const item of d.order.items) {
          const batch = item.batch;
          if (
            !batch ||
            batch.status !== 'RELEASED' ||
            batch.expiresAt <= new Date() ||
            batch.availableQuantity.lt(item.quantity) ||
            batch.reservedQuantity.lt(item.quantity)
          )
            fail('Um lote desta entrega não está liberado ou não possui saldo reservado.');
          const updated = await tx.batch.update({
            where: { id: batch.id },
            data: {
              availableQuantity: { decrement: item.quantity },
              reservedQuantity: { decrement: item.quantity },
            },
          });
          if (updated.availableQuantity.isZero())
            await tx.batch.update({ where: { id: batch.id }, data: { status: 'EXHAUSTED' } });
          await tx.stockMovement.create({
            data: {
              batchId: batch.id,
              type: 'SALE',
              quantity: item.quantity.negated(),
              reason: 'Pedido entregue',
              reference: d.orderId,
            },
          });
        }
        const now = new Date();
        await tx.order.update({
          where: { id: d.orderId },
          data: {
            status: 'DELIVERED',
            history: { create: { status: 'DELIVERED', actorName: request.viewer.name } },
          },
        });
        await tx.receivable.create({
          data: {
            orderId: d.orderId,
            amount: d.order.total,
            dueDate: new Date(+now + d.order.customer.paymentTermDays * 86400000),
          },
        });
        return tx.delivery.update({
          where: { id: recordId },
          data: {
            deliveredAt: now,
            signature: input.signature,
            events: {
              create: {
                type: 'DELIVERED',
                description: input.notes ?? `Recebido por ${input.signature}`,
              },
            },
          },
        });
      });
    },
  );
  app.post(
    '/api/deliveries/:id/events',
    { preHandler: authorize('deliveries') },
    async (request) => {
      const recordId = paramId(request);
      const input = z
        .object({
          type: z.enum(['ABSENT', 'RETURN', 'NOTE']),
          description: z.string().min(5).max(1000),
        })
        .strict()
        .parse(request.body);
      return mutation(request, `DELIVERY_EVENT:${recordId}`, input, async (tx) => {
        const d = await tx.delivery.findUniqueOrThrow({ where: { id: recordId } });
        if (
          request.viewer.role !== 'OWNER' &&
          (request.viewer.role !== 'DRIVER' || d.driverId !== request.viewer.id)
        )
          fail('Acesso restrito a esta entrega.', 403);
        return tx.deliveryEvent.create({ data: { deliveryId: recordId, ...input } });
      });
    },
  );
  app.post('/api/stock/purchase', { preHandler: authorize('supplies') }, async (request, reply) => {
    const input = z
      .object({
        supplyId: id,
        lotCode: name,
        quantity: qty,
        unitCost: z.number().positive().max(1e6).multipleOf(0.0001),
        supplier: name,
        expiresAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict()
      .parse(request.body);
    const result = await mutation(request, 'SUPPLY_PURCHASE', input, async (tx) => {
      if (D(input.quantity).mul(input.unitCost).gt('999999999999.99'))
        fail('Valor de compra acima do limite suportado.', 400);
      if (input.expiresAt && new Date(input.expiresAt) <= new Date())
        fail('A compra não pode entrar vencida.', 400);
      const purchase = await tx.supplyPurchase.create({
        data: {
          ...input,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          date: new Date(),
        },
      });
      await tx.supply.update({
        where: { id: input.supplyId },
        data: { stock: { increment: input.quantity }, unitCost: input.unitCost },
      });
      await tx.stockMovement.create({
        data: {
          supplyId: input.supplyId,
          type: 'PURCHASE',
          quantity: input.quantity,
          reason: 'Compra de insumo',
          reference: purchase.id,
        },
      });
      await tx.payable.create({
        data: {
          description: `Compra — ${input.supplier}`,
          category: 'SUPPLIES',
          amount: D(input.quantity).mul(input.unitCost).toDecimalPlaces(2),
          dueDate: new Date(Date.now() + 30 * 86400000),
          reference: purchase.id,
        },
      });
      return purchase;
    });
    return reply.code(201).send(result);
  });
  app.post('/api/stock/adjust', { preHandler: authorize('supplies') }, async (request) => {
    const input = z
      .object({
        batchId: id,
        newQuantity: z.number().min(0).max(9999999.999).multipleOf(0.001),
        reason: z.string().trim().min(5).max(500),
        loss: z.boolean().default(false),
      })
      .strict()
      .parse(request.body);
    return mutation(request, 'STOCK_ADJUST', input, async (tx) => {
      const b = await tx.batch.findUniqueOrThrow({ where: { id: input.batchId } });
      const delta = D(input.newQuantity).minus(b.availableQuantity);
      if (D(input.newQuantity).lt(b.reservedQuantity))
        fail('O saldo não pode ficar abaixo das reservas existentes.');
      if (input.loss && delta.gte(0)) fail('Uma perda precisa reduzir o estoque.', 400);
      await tx.stockMovement.create({
        data: {
          batchId: b.id,
          type: input.loss ? 'LOSS' : 'ADJUSTMENT',
          quantity: delta,
          reason: input.reason,
        },
      });
      if (input.loss)
        await tx.lossRecord.create({
          data: {
            batchId: b.id,
            quantity: delta.negated(),
            cost: delta.negated().mul(b.unitCost).toDecimalPlaces(2),
            date: new Date(),
            reason: input.reason,
          },
        });
      return tx.batch.update({
        where: { id: b.id },
        data: {
          availableQuantity: input.newQuantity,
          status:
            input.newQuantity === 0 ? 'EXHAUSTED' : b.status === 'EXHAUSTED' ? 'BLOCKED' : b.status,
        },
      });
    });
  });
  const supplySchema = z
    .object({
      name,
      unit: z.enum(['kg', 'L', 'g', 'un']),
      unitCost: z.number().min(0).max(1e6),
      minimumStock: z.number().min(0).max(1e7),
    })
    .strict();
  for (const method of ['POST', 'PUT'] as const)
    app.route({
      method,
      url: method === 'POST' ? '/api/supplies' : '/api/supplies/:id',
      preHandler: authorize('supplies'),
      handler: async (request, reply) => {
        const input = supplySchema.parse(request.body);
        const recordId = method === 'PUT' ? paramId(request) : undefined;
        const result = await mutation(
          request,
          `${method}:supply:${recordId ?? ''}`,
          input,
          async (tx) => {
            if (recordId) {
              const current = await tx.supply.findUniqueOrThrow({ where: { id: recordId } });
              if (
                current.unit !== input.unit &&
                (await tx.supplyPurchase.count({ where: { supplyId: recordId } }))
              )
                fail('A unidade não pode mudar após uma compra.');
              return tx.supply.update({ where: { id: recordId }, data: input });
            }
            return tx.supply.create({ data: { ...input, stock: 0 } });
          },
        );
        return reply.code(recordId ? 200 : 201).send(result);
      },
    });
  app.get('/api/payables', { preHandler: authorize('finance') }, async () => ({
    rows: await db.payable.findMany({
      orderBy: [{ dueDate: 'desc' }, { id: 'asc' }],
      take: 500,
      include: { payments: true },
    }),
  }));
  app.post('/api/payables', { preHandler: authorize('finance') }, async (request, reply) => {
    const input = z
      .object({
        description: name,
        category: name,
        amount: money.refine((n) => n > 0),
        dueDate: z.string().datetime({ offset: true }),
      })
      .strict()
      .parse(request.body);
    return reply
      .code(201)
      .send(
        await mutation(request, 'PAYABLE_CREATE', input, (tx) =>
          tx.payable.create({ data: { ...input, dueDate: new Date(input.dueDate) } }),
        ),
      );
  });
  for (const kind of ['receivables', 'payables'] as const)
    app.post(`/api/${kind}/:id/pay`, { preHandler: authorize('finance') }, async (request) => {
      const recordId = paramId(request);
      const input = z
        .object({
          amount: money.refine((n) => n > 0, 'Informe um valor positivo.'),
          method: z.enum(['PIX', 'CASH', 'CARD', 'TRANSFER', 'BOLETO']),
        })
        .strict()
        .parse(request.body);
      return mutation(request, `PAY:${kind}:${recordId}`, input, async (tx) => {
        const record =
          kind === 'receivables'
            ? await tx.receivable.findUniqueOrThrow({ where: { id: recordId } })
            : await tx.payable.findUniqueOrThrow({ where: { id: recordId } });
        if (record.amount.minus(record.paidAmount).lt(input.amount))
          fail('O pagamento é maior que o saldo em aberto.');
        if (kind === 'receivables') {
          await tx.receivablePayment.create({
            data: {
              receivableId: recordId,
              amount: input.amount,
              date: new Date(),
              method: input.method,
            },
          });
          return tx.receivable.update({
            where: { id: recordId },
            data: { paidAmount: { increment: input.amount } },
          });
        }
        await tx.payablePayment.create({
          data: {
            payableId: recordId,
            amount: input.amount,
            date: new Date(),
            method: input.method,
          },
        });
        return tx.payable.update({
          where: { id: recordId },
          data: { paidAmount: { increment: input.amount } },
        });
      });
    });
  app.post(
    '/api/announcements',
    { preHandler: authorize('announcements') },
    async (request, reply) => {
      const input = z
        .object({ title: name, content: z.string().trim().min(5).max(4000) })
        .strict()
        .parse(request.body);
      return reply
        .code(201)
        .send(
          await mutation(request, 'PUBLISH_ANNOUNCEMENT', input, (tx) =>
            tx.announcement.create({ data: { ...input, authorId: request.viewer.id } }),
          ),
        );
    },
  );
  app.get('/api/finance/summary', { preHandler: authorize('finance') }, async () => {
    const [receivables, payables, payments, outPayments, losses, fixed] = await Promise.all([
      db.receivable.findMany(),
      db.payable.findMany(),
      db.receivablePayment.findMany({ orderBy: { date: 'desc' }, take: 1000 }),
      db.payablePayment.findMany({ orderBy: { date: 'desc' }, take: 1000 }),
      db.lossRecord.aggregate({ _sum: { cost: true } }),
      db.fixedCost.findMany(),
    ]);
    const [incomingSum, outgoingSum] = await Promise.all([
      db.receivablePayment.aggregate({ _sum: { amount: true } }),
      db.payablePayment.aggregate({ _sum: { amount: true } }),
    ]);
    return {
      receivableBalance: receivables.reduce((s, r) => s.plus(r.amount.minus(r.paidAmount)), D(0)),
      payableBalance: payables.reduce((s, r) => s.plus(r.amount.minus(r.paidAmount)), D(0)),
      cashIn: incomingSum._sum.amount ?? 0,
      cashOut: outgoingSum._sum.amount ?? 0,
      lossCost: losses._sum.cost ?? 0,
      fixedCosts: fixed,
      payments,
      outPayments,
    };
  });
  app.get('/api/stock', { preHandler: authorize('stock') }, async (request) => {
    const q = z
      .object({
        search: z.string().trim().max(100).default(''),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .strict()
      .parse(request.query);
    const where = {
      availableQuantity: { gt: 0 },
      OR: [
        { code: { contains: q.search, mode: 'insensitive' as const } },
        { product: { name: { contains: q.search, mode: 'insensitive' as const } } },
      ],
    };
    const [batches, positions, total, lowSupplyCount] = await Promise.all([
      db.batch.findMany({
        where,
        include: { product: true },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      db.batch.findMany({
        where,
        select: {
          availableQuantity: true,
          reservedQuantity: true,
          unitCost: true,
          status: true,
          expiresAt: true,
        },
      }),
      db.batch.count({ where }),
      db.supply.count({ where: { deletedAt: null, stock: { lt: db.supply.fields.minimumStock } } }),
    ]);
    return {
      batches,
      total,
      page: q.page,
      limit: q.limit,
      value: positions
        .reduce((s, b) => s.plus(b.availableQuantity.mul(b.unitCost)), D(0))
        .toDecimalPlaces(2),
      releasedLots: positions.filter(
        (b) =>
          b.status === 'RELEASED' &&
          b.expiresAt > new Date() &&
          b.availableQuantity.gt(b.reservedQuantity),
      ).length,
      reservedLots: positions.filter((b) => b.reservedQuantity.gt(0)).length,
      lowSupplyCount,
    };
  });
}
