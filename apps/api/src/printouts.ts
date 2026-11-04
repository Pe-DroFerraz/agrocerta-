import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from './db.js';
import { authorize } from './auth.js';
import { dateRange, periodSchema, localDay } from './dates.js';
import { pdf } from './traceability.js';
import { D, fail } from './operations-core.js';
const id = z.string().min(1).max(100);
const displayDate = (v: Date) => v.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const money = (v: unknown) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export async function printRoutes(app: FastifyInstance) {
  app.get(
    '/api/producers/:id/statement.pdf',
    { preHandler: authorize('producers') },
    async (request, reply) => {
      const recordId = z.object({ id }).strict().parse(request.params).id;
      const input = z
        .object({
          month: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .default(localDay().slice(0, 7)),
        })
        .strict()
        .parse(request.query);
      const start = new Date(`${input.month}-01T00:00:00-03:00`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      const producer = await db.producer.findUniqueOrThrow({
        where: { id: recordId },
        include: {
          receipts: { where: { date: { gte: start, lt: end } }, orderBy: { date: 'asc' } },
        },
      });
      const volume = producer.receipts
        .filter((r) => r.approved)
        .reduce((s, r) => s.plus(r.liters), D(0));
      const total = producer.receipts
        .filter((r) => r.approved)
        .reduce((s, r) => s.plus(r.liters.mul(r.pricePerLiter).toDecimalPlaces(2)), D(0));
      const payables = await db.payable.findMany({
        where: { reference: { in: producer.receipts.map((r) => r.id) } },
        include: { payments: true },
      });
      const paid = payables.reduce((s, p) => s.plus(p.paidAmount), D(0));
      const body = await pdf(`Extrato do produtor — ${input.month}`, [
        producer.name,
        `${producer.farm} / ${producer.city}`,
        `Volume aprovado: ${volume.toString()} L`,
        `Valor dos recebimentos aprovados: ${money(total)}`,
        `Pagamentos vinculados aos recebimentos: ${money(paid)}`,
        `Saldo destes recebimentos: ${money(total.minus(paid))}`,
        ...producer.receipts.map(
          (r) =>
            `${displayDate(r.date)} | ${r.liters} L | ${r.approved ? 'Aprovado' : 'Reprovado'} | ${money(r.pricePerLiter)}/L | ${money(r.approved ? r.liters.mul(r.pricePerLiter) : 0)}`,
        ),
      ]);
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="extrato-produtor-${input.month}.pdf"`)
        .send(body);
    },
  );
  app.get(
    '/api/deliveries/manifest.pdf',
    { preHandler: authorize('deliveries') },
    async (request, reply) => {
      const input = z
        .object({ date: z.string().default(localDay()), driverId: id.optional() })
        .strict()
        .parse(request.query);
      const { start, end } = dateRange(
        periodSchema.parse({ period: 'custom', from: input.date, to: input.date }),
      );
      const rows = await db.delivery.findMany({
        where: {
          order: { status: { not: 'CANCELLED' } },
          scheduledAt: { gte: start, lt: end },
          ...(request.viewer.role === 'DRIVER'
            ? { driverId: request.viewer.id }
            : input.driverId
              ? { driverId: input.driverId }
              : {}),
        },
        include: {
          route: true,
          vehicle: true,
          driver: { select: { name: true } },
          order: {
            include: { customer: true, items: { include: { product: true, batch: true } } },
          },
        },
        orderBy: [{ routeId: 'asc' }, { stopNumber: 'asc' }, { id: 'asc' }],
      });
      const lines = rows.flatMap((d) => [
        `${d.stopNumber}. ${d.order.customer.name} — ${d.order.code}`,
        `${d.order.customer.address}, ${d.order.customer.city}`,
        `Rota: ${d.route.name} | Veiculo: ${d.vehicle.plate} | Motorista: ${d.driver.name}`,
        ...d.order.items.map(
          (i) =>
            `  ${i.quantity} ${i.product.unit} de ${i.product.name} | Lote ${i.batch?.code ?? 'sem reserva'}`,
        ),
        `Recebido por: ${d.signature ?? '___________________________'}`,
        '',
      ]);
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="romaneio-${input.date}.pdf"`)
        .send(
          await pdf(
            `Romaneio de entregas — ${input.date}`,
            lines.length ? lines : ['Nenhuma entrega agendada para esta seleção.'],
          ),
        );
    },
  );
  app.get(
    '/api/deliveries/:id/receipt.pdf',
    { preHandler: authorize('deliveries') },
    async (request, reply) => {
      const recordId = z.object({ id }).strict().parse(request.params).id;
      const delivery = await db.delivery.findUniqueOrThrow({
        where: { id: recordId },
        include: {
          order: {
            include: { customer: true, items: { include: { product: true, batch: true } } },
          },
          driver: { select: { name: true } },
          vehicle: true,
          events: { orderBy: { date: 'asc' } },
        },
      });
      if (request.viewer.role === 'DRIVER') {
        const today = dateRange({ period: 'today' });
        if (
          delivery.driverId !== request.viewer.id ||
          delivery.scheduledAt < today.start ||
          delivery.scheduledAt >= today.end
        )
          fail('Você só pode consultar suas entregas de hoje.', 403);
      }
      return reply
        .type('application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="comprovante-${delivery.order.code}.pdf"`,
        )
        .send(
          await pdf(`Canhoto de entrega — ${delivery.order.code}`, [
            delivery.order.customer.name,
            `${delivery.order.customer.address}, ${delivery.order.customer.city}`,
            `Motorista: ${delivery.driver.name} | Veiculo: ${delivery.vehicle.plate}`,
            ...delivery.order.items.map(
              (i) =>
                `${i.quantity} ${i.product.unit} de ${i.product.name} | Lote ${i.batch?.code ?? 'sem lote'}`,
            ),
            `Total: ${money(delivery.order.total)}`,
            `Entrega: ${delivery.deliveredAt ? displayDate(delivery.deliveredAt) : 'Ainda não concluída'}`,
            `Recebedor: ${delivery.signature ?? 'Não registrado'}`,
            ...delivery.events.map((e) => `${displayDate(e.date)} — ${e.description}`),
          ]),
        );
    },
  );
}
