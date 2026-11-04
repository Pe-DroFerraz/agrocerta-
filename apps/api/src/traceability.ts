import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { periodSchema, dateRange } from './dates.js';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { db } from './db.js';
import { config } from './config.js';
import { authorize } from './auth.js';
import { operate } from './operations-core.js';
import { requestId } from './operations.js';
const id = z.string().min(1).max(100);
export async function pdf(title: string, lines: string[], qr?: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 45 });
  const chunks: Buffer[] = [];
  const ready = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.fontSize(21).fillColor('#14532D').text('AGRO CERTA');
  doc.moveDown(0.5).fontSize(15).text(title);
  doc.fillColor('#333333').fontSize(10).moveDown();
  for (const line of lines) {
    doc.text(line, { paragraphGap: 6 });
  }
  if (qr) {
    if (doc.y > 650) doc.addPage();
    doc.image(Buffer.from(qr.split(',')[1], 'base64'), { fit: [120, 120] });
  }
  doc.end();
  return ready;
}
async function trace(code: string) {
  const b = await db.batch.findUniqueOrThrow({
    where: { code },
    include: {
      product: true,
      production: {
        include: {
          responsible: { select: { name: true } },
          sources: { include: { receipt: { include: { producer: true } } } },
          supplies: { include: { supply: true, purchase: true } },
        },
      },
      orderItems: { include: { order: { include: { customer: true, delivery: true } } } },
      movements: { orderBy: { date: 'asc' } },
    },
  });
  const delivered = b.orderItems.filter((i) => i.order.status === 'DELIVERED');
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    product: b.product.name,
    unit: b.product.unit,
    manufacturedAt: b.manufacturedAt,
    expiresAt: b.expiresAt,
    availableQuantity: b.availableQuantity,
    reservedQuantity: b.reservedQuantity,
    unitCost: b.unitCost,
    responsible: b.production.responsible.name,
    sources: b.production.sources.map((s) => ({
      id: s.id,
      producerId: s.receipt.producerId,
      producer: s.receipt.producer.name,
      farm: s.receipt.producer.farm,
      city: s.receipt.producer.city,
      receiptId: s.receiptId,
      date: s.receipt.date,
      liters: s.liters,
      temperature: s.receipt.temperature,
      acidity: s.receipt.acidity,
      fat: s.receipt.fat,
      protein: s.receipt.protein,
      scc: s.receipt.scc,
      approved: s.receipt.approved,
    })),
    supplies: b.production.supplies.map((u) => ({
      id: u.id,
      name: u.supply.name,
      quantity: u.quantity,
      unit: u.supply.unit,
      lotCode: u.purchase.lotCode,
      supplier: u.purchase.supplier,
    })),
    customers: delivered.map((i) => ({
      customerId: i.order.customerId,
      name: i.order.customer.name,
      phone: i.order.customer.phone,
      orderCode: i.order.code,
      quantity: i.quantity,
      deliveredAt: i.order.delivery?.deliveredAt,
    })),
    pendingOrders: b.orderItems
      .filter((i) => !['DELIVERED', 'CANCELLED'].includes(i.order.status))
      .map((i) => ({
        id: i.orderId,
        code: i.order.code,
        status: i.order.status,
        customer: i.order.customer.name,
      })),
    timeline: b.movements.map((m) => ({
      id: m.id,
      date: m.date,
      type: m.type,
      reason: m.reason,
      quantity: m.quantity,
    })),
    qrCode: await QRCode.toDataURL(`${config.WEB_ORIGIN}/rastreio/${encodeURIComponent(b.code)}`, {
      width: 240,
      margin: 1,
    }),
    publicPath: `/rastreio/${encodeURIComponent(b.code)}`,
  };
}
export async function traceRoutes(app: FastifyInstance) {
  app.get('/api/traceability/options', { preHandler: authorize('traceability') }, async () => ({
    producers: await db.producer.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    customers: await db.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  }));
  app.get('/api/traceability', { preHandler: authorize('traceability') }, async (request) => {
    const input = z
      .object({
        code: z.string().max(100).optional(),
        producerId: id.optional(),
        customerId: id.optional(),
        supplyLot: z.string().max(100).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .strict()
      .parse(request.query);
    if (
      input.code &&
      !input.producerId &&
      !input.customerId &&
      !input.supplyLot &&
      !input.from &&
      !input.to
    )
      return trace(input.code);
    const filters: Prisma.BatchWhereInput[] = [];
    if (input.code) filters.push({ code: input.code });
    if (input.producerId)
      filters.push({
        production: { sources: { some: { receipt: { producerId: input.producerId } } } },
      });
    if (input.customerId)
      filters.push({
        orderItems: { some: { order: { customerId: input.customerId, status: 'DELIVERED' } } },
      });
    if (input.supplyLot)
      filters.push({
        production: {
          supplies: {
            some: { purchase: { lotCode: { contains: input.supplyLot, mode: 'insensitive' } } },
          },
        },
      });
    if (input.from || input.to) {
      const range = dateRange(
        periodSchema.parse({ period: 'custom', from: input.from, to: input.to }),
      );
      filters.push({ manufacturedAt: { gte: range.start, lt: range.end } });
    }
    const rows = await db.batch.findMany({
      where: { AND: filters },
      select: {
        id: true,
        code: true,
        status: true,
        product: { select: { name: true } },
        manufacturedAt: true,
      },
      orderBy: [{ manufacturedAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    return { rows };
  });
  app.get('/api/public/trace/:code', async (request) => {
    const { code } = z
      .object({ code: z.string().regex(/^[A-Z0-9-]{3,80}$/) })
      .strict()
      .parse(request.params);
    const batch = await trace(code);
    const company = await db.company.findFirstOrThrow({ select: { name: true, city: true } });
    return {
      code: batch.code,
      product: batch.product,
      manufacturedAt: batch.manufacturedAt,
      expiresAt: batch.expiresAt,
      status: new Date(batch.expiresAt) <= new Date() ? 'EXPIRED' : batch.status,
      company,
      sources: batch.sources.map((s) => ({ farm: s.farm, city: s.city, approved: s.approved })),
    };
  });
  app.get(
    '/api/batches/:id/label.pdf',
    { preHandler: authorize('traceability') },
    async (request, reply) => {
      const { id: recordId } = z.object({ id }).strict().parse(request.params);
      const b = await db.batch.findUniqueOrThrow({ where: { id: recordId } });
      const data = await trace(b.code);
      const content = await pdf(
        'Etiqueta do lote',
        [
          data.product,
          `Lote: ${data.code}`,
          `Fabricacao: ${new Date(data.manufacturedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
          `Validade: ${new Date(data.expiresAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
          `Situacao: ${data.status}`,
        ],
        data.qrCode,
      );
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="etiqueta-${b.code}.pdf"`)
        .send(content);
    },
  );
  app.get(
    '/api/batches/:id/trace.pdf',
    { preHandler: authorize('traceability') },
    async (request, reply) => {
      const { id: recordId } = z.object({ id }).strict().parse(request.params);
      const b = await db.batch.findUniqueOrThrow({ where: { id: recordId } });
      const t = await trace(b.code);
      const content = await pdf(
        `Rastreabilidade — ${t.code}`,
        [
          t.product,
          `Responsavel: ${t.responsible}`,
          `Situacao: ${t.status}`,
          'ORIGEM DO LEITE',
          ...t.sources.map(
            (s) =>
              `${s.producer} / ${s.farm}, ${s.city} — ${s.liters} L — recebimento ${s.receiptId}`,
          ),
          'INSUMOS',
          ...t.supplies.map((s) => `${s.name}: ${s.quantity} ${s.unit}, lote ${s.lotCode}`),
          'CLIENTES ATENDIDOS',
          ...t.customers.map((c) => `${c.name} — ${c.orderCode} — ${c.quantity} ${t.unit}`),
        ],
        t.qrCode,
      );
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="rastreio-${t.code}.pdf"`)
        .send(content);
    },
  );
  app.post(
    '/api/batches/:id/recall',
    { preHandler: authorize('traceability') },
    async (request) => {
      const { id: recordId } = z.object({ id }).strict().parse(request.params);
      const input = z
        .object({ reason: z.string().trim().min(5).max(1000) })
        .strict()
        .parse(request.body);
      await operate(
        request.viewer.id,
        requestId(request),
        `RECALL:${recordId}`,
        input,
        async (tx) => {
          const batch = await tx.batch.findUniqueOrThrow({ where: { id: recordId } });
          await tx.batch.update({ where: { id: recordId }, data: { status: 'BLOCKED' } });
          if (!(await tx.auditLog.count({ where: { action: `RECALL:${recordId}` } }))) {
            const users = await tx.user.findMany({
              where: { active: true, role: { key: { in: ['OWNER', 'SALES'] } } },
              select: { id: true },
            });
            await tx.notification.createMany({
              data: users.map((u) => ({
                userId: u.id,
                title: `Recall do lote ${batch.code}`,
                content: input.reason,
              })),
            });
          }
          return { id: recordId, status: 'BLOCKED' };
        },
      );
      const data = await trace(
        (await db.batch.findUniqueOrThrow({ where: { id: recordId } })).code,
      );
      const customers = [...new Map(data.customers.map((c) => [c.customerId, c])).values()].map(
        (c) => {
          const message = `Olá, ${c.name}. Por favor, separe os produtos do lote ${data.code} (${data.product}) e não os consuma. Motivo: ${input.reason}. Entre em contato com a Agro Certa para orientação.`;
          return {
            ...c,
            message,
            whatsappUrl: `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`,
          };
        },
      );
      return { ...data, affectedCustomers: customers };
    },
  );
}
