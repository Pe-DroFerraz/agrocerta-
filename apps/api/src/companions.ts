import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from './db.js';
import { authorize } from './auth.js';
import { operate, saveOrder, release, recostMonth, fail, D, type Tx } from './operations-core.js';
import { requestId } from './operations.js';
import { localDay, periodSchema } from './dates.js';
const id = z.string().min(1).max(100);
const name = z.string().trim().min(2).max(150);
const amount = z.number().finite().min(0).max(1e8).multipleOf(0.01);
const planSchema = z
  .object({
    customerId: id,
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length, 'Não repita um dia da semana.'),
    paused: z.boolean().default(false),
    paymentMethod: z.enum(['PIX', 'BOLETO', 'CASH', 'CARD']),
    items: z
      .array(
        z
          .object({ productId: id, quantity: z.number().positive().max(1e6).multipleOf(0.001) })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export async function generateRecurring(tx: Tx, actorId: string) {
  const plans = await tx.recurringOrder.findMany({
    where: { paused: false, customer: { status: 'ACTIVE', deletedAt: null } },
    include: { items: true, exceptions: true },
  });
  const today = localDay();
  let created = 0;
  for (const plan of plans)
    for (let i = 0; i < 7; i++) {
      const date = new Date(`${today}T12:00:00-03:00`);
      date.setUTCDate(date.getUTCDate() + i);
      const day = localDay(date);
      if (
        !plan.weekdays.includes(date.getUTCDay()) ||
        plan.exceptions.some((e) => e.skip && localDay(e.date) === day)
      )
        continue;
      const key = `${plan.id}|${day}`;
      if (await tx.order.count({ where: { occurrenceKey: key } })) continue;
      await saveOrder(
        tx,
        actorId,
        {
          customerId: plan.customerId,
          deliveryDate: date.toISOString(),
          paymentMethod: plan.paymentMethod,
          status: 'NEW',
          notes: 'Gerado automaticamente de pedido fixo. Confirmar para reservar estoque.',
          items: plan.items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
        },
        undefined,
        { id: plan.id, key },
      );
      created++;
    }
  return { created };
}
export function parseOrderText(
  text: string,
  products: { id: string; name: string; unit: string; salePrice: unknown }[],
) {
  const normal = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/^queijo\s+/, '')
      .trim();
  const items: {
    productId: string;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }[] = [];
  const warnings: string[] = [];
  const pattern =
    /(\d+(?:[.,]\d+)?)\s*(kg|litros?|l|un(?:idades?)?)?\s*(?:de\s+)?([^,;\n]+?)(?=\s+e\s+\d|$|[,;\n])/gi;
  for (const match of text.matchAll(pattern)) {
    const term = normal(match[3]);
    const matches = products.filter(
      (p) => normal(p.name).includes(term) || term.includes(normal(p.name)),
    );
    if (matches.length !== 1) {
      warnings.push(`Identifique o produto de “${match[3].trim()}”.`);
      continue;
    }
    const p = matches[0];
    const quantity = Number(match[1].replace(',', '.'));
    if (!(quantity > 0 && quantity <= 1e6)) {
      warnings.push('Quantidade inválida.');
      continue;
    }
    const requested = match[2]?.toLowerCase();
    const unit = requested?.startsWith('l')
      ? 'L'
      : requested?.startsWith('un')
        ? 'un'
        : requested
          ? 'kg'
          : p.unit;
    if (unit !== p.unit) {
      warnings.push(`${p.name} é vendido em ${p.unit}, não em ${unit}.`);
      continue;
    }
    items.push({
      productId: p.id,
      name: p.name,
      quantity,
      unit: p.unit,
      unitPrice: Number(p.salePrice),
    });
  }
  if (!items.length) warnings.push('Use, por exemplo: “10 kg de minas frescal e 5 requeijão”.');
  return { items, warnings };
}
export async function companionRoutes(app: FastifyInstance) {
  app.get('/api/settings', { preHandler: authorize('settings') }, async () => ({
    company: await db.company.findFirstOrThrow(),
    routes: await db.route.findMany({ orderBy: { name: 'asc' } }),
    vehicles: await db.vehicle.findMany({ orderBy: { name: 'asc' } }),
    fixedCosts: await db.fixedCost.findMany({ orderBy: [{ month: 'desc' }, { category: 'asc' }] }),
    categories: await db.product.findMany({ distinct: ['category'], select: { category: true } }),
  }));
  const quality = z
    .object({
      maxTemperature: z.number().min(0).max(15),
      minAcidity: z.number().min(0).max(30),
      maxAcidity: z.number().min(0).max(30),
      maxScc: z.number().int().min(1).max(1e7),
      minFat: z.number().min(0).max(20).default(2.8),
      minProtein: z.number().min(0).max(20).default(2.9),
    })
    .strict()
    .refine((q) => q.maxAcidity >= q.minAcidity, 'Acidez máxima deve superar a mínima.');
  app.put('/api/settings', { preHandler: authorize('settings') }, async (request) => {
    const input = z
      .object({
        name,
        document: z.string().min(3).max(40),
        city: name,
        address: name,
        expiryAlertDays: z.number().int().min(1).max(90),
        qualityParameters: quality,
      })
      .strict()
      .parse(request.body);
    return operate(request.viewer.id, requestId(request), 'COMPANY_SETTINGS', input, async (tx) => {
      const c = await tx.company.findFirstOrThrow();
      return tx.company.update({ where: { id: c.id }, data: input });
    });
  });
  app.post('/api/settings/fixed-costs', { preHandler: authorize('settings') }, async (request) => {
    const input = z
      .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), category: name, amount })
      .strict()
      .parse(request.body);
    return operate(request.viewer.id, requestId(request), 'FIXED_COST', input, async (tx) => {
      const cost = await tx.fixedCost.upsert({
        where: { month_category: { month: input.month, category: input.category } },
        create: input,
        update: { amount: input.amount },
      });
      await recostMonth(tx, new Date(`${input.month}-15T12:00:00-03:00`));
      return cost;
    });
  });
  for (const kind of ['routes', 'vehicles'] as const) {
    for (const method of ['POST', 'PUT'] as const)
      app.route({
        method,
        url: `/api/settings/${kind}${method === 'PUT' ? '/:id' : ''}`,
        preHandler: authorize('settings'),
        handler: async (request) => {
          const input =
            kind === 'routes'
              ? z.object({ name, city: name }).strict().parse(request.body)
              : z
                  .object({
                    name,
                    plate: z.string().regex(/^[A-Z0-9-]{6,10}$/),
                    capacityKg: z.number().positive().max(1e5),
                  })
                  .strict()
                  .parse(request.body);
          const recordId =
            method === 'PUT' ? z.object({ id }).strict().parse(request.params).id : undefined;
          return operate(
            request.viewer.id,
            requestId(request),
            `${method}:${kind}:${recordId ?? ''}`,
            input,
            async (tx) => {
              if (kind === 'routes') {
                const data = z.object({ name, city: name }).parse(input);
                return recordId
                  ? tx.route.update({ where: { id: recordId }, data })
                  : tx.route.create({ data });
              }
              const data = z
                .object({ name, plate: z.string(), capacityKg: z.number() })
                .parse(input);
              if (recordId) {
                const inRoute = await tx.delivery.findMany({
                  where: { vehicleId: recordId, order: { status: 'IN_ROUTE' } },
                  include: { order: { include: { items: { include: { product: true } } } } },
                });
                const load = inRoute.reduce(
                  (s, d) =>
                    s.plus(
                      d.order.items.reduce(
                        (t, i) => t.plus(i.quantity.mul(i.product.kgPerUnit)),
                        D(0),
                      ),
                    ),
                  D(0),
                );
                if (load.gt(data.capacityKg))
                  fail('Capacidade menor que a carga atualmente em rota.');
                return tx.vehicle.update({ where: { id: recordId }, data });
              }
              return tx.vehicle.create({ data });
            },
          );
        },
      });
    app.delete(
      `/api/settings/${kind}/:id`,
      { preHandler: authorize('settings') },
      async (request) => {
        const recordId = z.object({ id }).strict().parse(request.params).id;
        return operate(
          request.viewer.id,
          requestId(request),
          `DELETE:${kind}:${recordId}`,
          {},
          async (tx) => {
            if (
              await tx.delivery.count({
                where: kind === 'routes' ? { routeId: recordId } : { vehicleId: recordId },
              })
            )
              fail('Este cadastro possui histórico de entregas e não pode ser excluído.');
            return kind === 'routes'
              ? tx.route.delete({ where: { id: recordId } })
              : tx.vehicle.delete({ where: { id: recordId } });
          },
        );
      },
    );
  }
  app.get('/api/recurring', { preHandler: authorize('recurring') }, async () => ({
    rows: await db.recurringOrder.findMany({
      include: {
        customer: { select: { name: true } },
        items: { include: { product: { select: { name: true, unit: true } } } },
        exceptions: true,
        orders: {
          where: {
            deliveryDate: {
              gte: new Date(`${localDay()}T00:00:00-03:00`),
              lt: new Date(+new Date(`${localDay()}T00:00:00-03:00`) + 7 * 86400000),
            },
          },
          select: { id: true, code: true, status: true, deliveryDate: true },
          orderBy: { deliveryDate: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    }),
  }));
  for (const method of ['POST', 'PUT'] as const)
    app.route({
      method,
      url: `/api/recurring${method === 'PUT' ? '/:id' : ''}`,
      preHandler: authorize('recurring'),
      handler: async (request, reply) => {
        const { items, ...input } = planSchema.parse(request.body);
        const recordId =
          method === 'PUT' ? z.object({ id }).strict().parse(request.params).id : undefined;
        const result = await operate(
          request.viewer.id,
          requestId(request),
          `${method}:RECURRING:${recordId ?? ''}`,
          request.body,
          async (tx) => {
            await tx.customer.findFirstOrThrow({
              where: { id: input.customerId, status: 'ACTIVE', deletedAt: null },
            });
            for (const item of items)
              await tx.product.findFirstOrThrow({ where: { id: item.productId, deletedAt: null } });
            if (recordId) {
              await tx.recurringOrderItem.deleteMany({ where: { recurringOrderId: recordId } });
              return tx.recurringOrder.update({
                where: { id: recordId },
                data: { ...input, items: { create: items } },
              });
            }
            return tx.recurringOrder.create({ data: { ...input, items: { create: items } } });
          },
        );
        return reply.code(method === 'POST' ? 201 : 200).send(result);
      },
    });
  app.patch('/api/recurring/:id/pause', { preHandler: authorize('recurring') }, async (request) => {
    const recordId = z.object({ id }).strict().parse(request.params).id;
    const input = z.object({ paused: z.boolean() }).strict().parse(request.body);
    return operate(
      request.viewer.id,
      requestId(request),
      `PAUSE_RECURRING:${recordId}`,
      input,
      (tx) => tx.recurringOrder.update({ where: { id: recordId }, data: input }),
    );
  });
  app.post('/api/recurring/:id/skip', { preHandler: authorize('recurring') }, async (request) => {
    const recordId = z.object({ id }).strict().parse(request.params).id;
    const input = z
      .object({ date: z.string(), notes: z.string().max(500).optional() })
      .strict()
      .parse(request.body);
    periodSchema.parse({ period: 'custom', from: input.date, to: input.date });
    return operate(
      request.viewer.id,
      requestId(request),
      `SKIP_RECURRING:${recordId}`,
      input,
      async (tx) => {
        const plan = await tx.recurringOrder.findUniqueOrThrow({ where: { id: recordId } });
        if (!plan.weekdays.includes(new Date(`${input.date}T12:00:00-03:00`).getUTCDay()))
          fail('O plano não tem entrega neste dia da semana.', 400);
        const occurrence = await tx.order.findUnique({
          where: { occurrenceKey: `${recordId}|${input.date}` },
        });
        if (occurrence) {
          if (!['NEW', 'CONFIRMED'].includes(occurrence.status))
            fail('A ocorrência já entrou em separação ou entrega. Cancele pelo fluxo do pedido.');
          if (occurrence.status === 'CONFIRMED') await release(tx, occurrence.id);
          await tx.order.update({
            where: { id: occurrence.id },
            data: {
              status: 'CANCELLED',
              history: { create: { status: 'CANCELLED', actorName: request.viewer.name } },
            },
          });
        }
        return tx.recurringException.upsert({
          where: {
            recurringOrderId_date: {
              recurringOrderId: recordId,
              date: new Date(`${input.date}T12:00:00-03:00`),
            },
          },
          create: {
            recurringOrderId: recordId,
            date: new Date(`${input.date}T12:00:00-03:00`),
            skip: true,
            notes: input.notes,
          },
          update: { skip: true, notes: input.notes },
        });
      },
    );
  });
  app.post('/api/recurring/generate', { preHandler: authorize('recurring') }, async (request) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    return operate(request.viewer.id, requestId(request), 'GENERATE_RECURRING', {}, (tx) =>
      generateRecurring(tx, request.viewer.id),
    );
  });
  app.get('/api/whatsapp', { preHandler: authorize('whatsapp') }, async (request) => {
    const input = z.object({ customerId: id.optional() }).strict().parse(request.query);
    return {
      mode: 'DEMO',
      rows: await db.whatsAppMessage.findMany({
        where: input.customerId ? { customerId: input.customerId } : {},
        include: { customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      templates: await db.messageTemplate.findMany({ orderBy: { name: 'asc' } }),
    };
  });
  app.post('/api/whatsapp/messages', { preHandler: authorize('whatsapp') }, async (request) => {
    const input = z
      .object({ customerId: id, content: z.string().trim().min(1).max(4000) })
      .strict()
      .parse(request.body);
    return operate(
      request.viewer.id,
      requestId(request),
      'WHATSAPP_INBOUND_DEMO',
      input,
      async (tx) => {
        await tx.customer.findFirstOrThrow({ where: { id: input.customerId, deletedAt: null } });
        const message = await tx.whatsAppMessage.create({
          data: { ...input, direction: 'INBOUND_DEMO' },
        });
        const products = await tx.product.findMany({ where: { deletedAt: null } });
        const proposal = parseOrderText(input.content, products);
        const prices = await tx.customerPrice.findMany({ where: { customerId: input.customerId } });
        return {
          message,
          proposal: {
            ...proposal,
            items: proposal.items.map((i) => ({
              ...i,
              unitPrice: Number(
                prices.find((p) => p.productId === i.productId)?.price ?? i.unitPrice,
              ),
            })),
          },
        };
      },
    );
  });
  app.put('/api/whatsapp/templates/:id', { preHandler: authorize('whatsapp') }, async (request) => {
    const recordId = z.object({ id }).strict().parse(request.params).id;
    const input = z
      .object({ name, content: z.string().min(5).max(2000) })
      .strict()
      .parse(request.body);
    const variables = [...input.content.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (variables.some((v) => !['cliente', 'itens', 'total', 'data', 'lote'].includes(v)))
      fail('Variáveis permitidas: cliente, itens, total, data e lote.', 400);
    return operate(
      request.viewer.id,
      requestId(request),
      `MESSAGE_TEMPLATE:${recordId}`,
      input,
      (tx) => tx.messageTemplate.update({ where: { id: recordId }, data: input }),
    );
  });
  app.post('/api/whatsapp/prepare', { preHandler: authorize('whatsapp') }, async (request) => {
    const input = z
      .object({ customerId: id, content: z.string().trim().min(1).max(4000) })
      .strict()
      .parse(request.body);
    return operate(request.viewer.id, requestId(request), 'WHATSAPP_PREPARE', input, async (tx) => {
      if (/\{(?:cliente|itens|total|data|lote)\}/.test(input.content))
        fail('Preencha todas as variáveis antes de preparar o envio.', 400);
      const customer = await tx.customer.findFirstOrThrow({
        where: { id: input.customerId, deletedAt: null },
      });
      const message = await tx.whatsAppMessage.create({
        data: { ...input, direction: 'PREPARED_DEMO' },
      });
      return {
        message,
        whatsappUrl: `https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(input.content)}`,
      };
    });
  });
  for (const method of ['PUT', 'DELETE'] as const)
    app.route({
      method,
      url: '/api/announcements/:id',
      preHandler: authorize('announcements'),
      handler: async (request) => {
        const recordId = z.object({ id }).strict().parse(request.params).id;
        const input =
          method === 'PUT'
            ? z
                .object({ title: name, content: z.string().min(5).max(4000) })
                .strict()
                .parse(request.body)
            : {};
        return operate(
          request.viewer.id,
          requestId(request),
          `${method}:ANNOUNCEMENT:${recordId}`,
          input,
          async (tx) => {
            const a = await tx.announcement.findUniqueOrThrow({ where: { id: recordId } });
            if (request.viewer.role !== 'OWNER' && a.authorId !== request.viewer.id)
              fail('Você só pode alterar avisos da sua autoria.', 403);
            if (method === 'DELETE') {
              if (await tx.announcementSend.count({ where: { announcementId: recordId } }))
                fail('Avisos com histórico de comunicação não podem ser excluídos.');
              return tx.announcement.delete({ where: { id: recordId } });
            }
            const data = z.object({ title: name, content: z.string() }).parse(input);
            return tx.announcement.update({ where: { id: recordId }, data });
          },
        );
      },
    });
  app.post('/api/finance/simulate', { preHandler: authorize('finance') }, async (request) => {
    const input = z
      .object({
        productId: id.optional(),
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        delta: z.number().finite().min(-5).max(20),
      })
      .strict()
      .parse(request.body);
    const start = new Date(`${input.month}-01T00:00:00-03:00`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const orders = await db.productionOrder.findMany({
      where: {
        date: { gte: start, lt: end },
        ...(input.productId ? { productId: input.productId } : {}),
      },
      include: { product: true, batch: true },
    });
    return {
      rows: orders.map((p) => {
        const milk = p.milkCost.plus(p.litersUsed.mul(input.delta));
        if (milk.lt(0)) fail('A redução supera o custo médio do leite de um lote.', 400);
        const total = p.totalCost.plus(p.litersUsed.mul(input.delta));
        const unit = total.div(p.quantityProduced);
        return {
          code: p.batch?.code,
          product: p.product.name,
          unit: p.product.unit,
          currentCost: Number(p.totalCost.div(p.quantityProduced).toFixed(4)),
          simulatedCost: Number(unit.toFixed(4)),
          deltaTotal: Number(total.minus(p.totalCost).toFixed(2)),
          salePrice: Number(p.product.salePrice),
          margin: p.product.salePrice.gt(0)
            ? Number(p.product.salePrice.minus(unit).div(p.product.salePrice).mul(100).toFixed(2))
            : null,
        };
      }),
    };
  });
}
