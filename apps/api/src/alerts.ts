import type { FastifyInstance } from 'fastify';
import { db } from './db.js';
import { authenticate } from './auth.js';
import { dateRange } from './dates.js';
export async function alertRoutes(app: FastifyInstance) {
  app.get('/api/alerts', { preHandler: authenticate }, async (request) => {
    const alerts: {
      id: string;
      title: string;
      description: string;
      severity: 'warning' | 'critical' | 'info';
      target: string;
    }[] = [];
    const permissions = request.viewer.permissions;
    const now = new Date();
    const today = dateRange({ period: 'today' });
    const company = await db.company.findFirstOrThrow();
    if (permissions.includes('batches')) {
      const [expiry, expired, supplies, products, batches, recent] = await Promise.all([
        db.batch.findMany({
          where: {
            status: 'RELEASED',
            availableQuantity: { gt: 0 },
            expiresAt: { gt: now, lte: new Date(+now + company.expiryAlertDays * 86400000) },
          },
          include: { product: { select: { name: true } } },
          orderBy: { expiresAt: 'asc' },
          take: 20,
        }),
        db.batch.count({ where: { availableQuantity: { gt: 0 }, expiresAt: { lte: now } } }),
        db.supply.findMany({
          where: { deletedAt: null, stock: { lt: db.supply.fields.minimumStock } },
          select: { id: true, name: true, stock: true, minimumStock: true },
        }),
        db.product.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, minimumStock: true, unit: true },
        }),
        db.batch.groupBy({
          by: ['productId'],
          where: { status: 'RELEASED', expiresAt: { gt: now } },
          _sum: { availableQuantity: true, reservedQuantity: true },
        }),
        db.productionOrder.findMany({
          orderBy: { date: 'desc' },
          take: 100,
          include: { product: { select: { name: true } } },
        }),
      ]);
      for (const b of expiry)
        alerts.push({
          id: `expiry-${b.id}`,
          title: `Validade próxima: ${b.product.name}`,
          description: `Lote ${b.code} vence em ${b.expiresAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`,
          severity: 'warning',
          target: `/batches?search=${encodeURIComponent(b.code)}`,
        });
      if (expired)
        alerts.push({
          id: 'expired-stock',
          title: `${expired} lotes vencidos com saldo`,
          description: 'Confira o inventário e registre os descartes necessários.',
          severity: 'critical',
          target: '/batches',
        });
      for (const s of supplies)
        alerts.push({
          id: `supply-${s.id}`,
          title: `Insumo abaixo do mínimo: ${s.name}`,
          description: `Saldo ${s.stock.toString()} · mínimo ${s.minimumStock.toString()}.`,
          severity: 'warning',
          target: `/supplies?search=${encodeURIComponent(s.name)}`,
        });
      for (const p of products) {
        const grouped = batches.find((b) => b.productId === p.id);
        const available =
          Number(grouped?._sum.availableQuantity ?? 0) -
          Number(grouped?._sum.reservedQuantity ?? 0);
        if (available < Number(p.minimumStock))
          alerts.push({
            id: `product-${p.id}`,
            title: `Estoque baixo: ${p.name}`,
            description: `Disponível para venda: ${available.toLocaleString('pt-BR')} ${p.unit}.`,
            severity: 'warning',
            target: `/batches?search=${encodeURIComponent(p.name)}`,
          });
      }
      const checked = new Set<string>();
      for (const p of recent) {
        if (checked.has(p.productId)) continue;
        checked.add(p.productId);
        const history = recent
          .filter((r) => r.productId === p.productId && r.id !== p.id)
          .slice(0, 9);
        if (history.length < 2) continue;
        const average =
          history.reduce((s, r) => s + Number(r.litersUsed) / Number(r.quantityProduced), 0) /
          history.length;
        const actual = Number(p.litersUsed) / Number(p.quantityProduced);
        if (actual > average * 1.1)
          alerts.push({
            id: `yield-${p.id}`,
            title: `Queda de rendimento: ${p.product.name}`,
            description: `Consumo de leite por unidade ${((actual / average - 1) * 100).toFixed(1)}% acima da média recente.`,
            severity: 'warning',
            target: `/batches?search=${encodeURIComponent(p.product.name)}`,
          });
      }
    }
    if (permissions.includes('orders')) {
      const count = await db.order.count({
        where: { deliveryDate: { lt: today.start }, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      });
      if (count)
        alerts.push({
          id: 'late-orders',
          title: `${count} pedidos com entrega atrasada`,
          description: 'Revise datas e pendências antes de enviar para a rota.',
          severity: 'critical',
          target: '/orders',
        });
    }
    if (permissions.includes('finance')) {
      const due = await db.receivable.findMany({
        where: { dueDate: { lt: today.start }, paidAmount: { lt: db.receivable.fields.amount } },
        select: { amount: true, paidAmount: true },
      });
      const amount = due.reduce((s, r) => s + Number(r.amount) - Number(r.paidAmount), 0);
      if (due.length)
        alerts.push({
          id: 'overdue',
          title: `${due.length} contas vencidas`,
          description: `Saldo vencido: ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
          severity: 'critical',
          target: '/finance',
        });
    }
    if (request.viewer.role === 'DRIVER') {
      const count = await db.delivery.count({
        where: {
          driverId: request.viewer.id,
          scheduledAt: { gte: today.start, lt: today.end },
          order: { status: 'IN_ROUTE' },
        },
      });
      if (count)
        alerts.push({
          id: 'my-deliveries',
          title: `${count} entregas em rota hoje`,
          description: 'Confira as paradas e registre cada recebimento.',
          severity: 'info',
          target: '/deliveries',
        });
    }
    return { rows: alerts };
  });
}
