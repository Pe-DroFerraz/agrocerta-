import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { db } from './db.js';
import { authorize } from './auth.js';
import { periodSchema, dateRange, localDay } from './dates.js';
const num = (n: Prisma.Decimal | number | null | undefined) => Number(n ?? 0);
const round = (n: number) => Number(n.toFixed(2));
export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    '/api/dashboard',
    {
      preHandler: authorize('dashboard'),
      schema: {
        tags: ['Painel'],
        description: 'Indicadores calculados no banco. Fuso America/Sao_Paulo; fim exclusivo.',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            period: { type: 'string', enum: ['today', '7', '30', 'month', 'custom'] },
            from: { type: 'string' },
            to: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { start, end } = dateRange(periodSchema.parse(request.query));
      const previousStart = new Date(+start - (+end - +start));
      const company = await db.company.findFirstOrThrow({ select: { expiryAlertDays: true } });
      const role = request.viewer.role;
      const financial = role === 'OWNER';
      const production = role !== 'SALES';
      const [
        receipts,
        productions,
        delivered,
        openOrders,
        deliveryCount,
        priorReceipts,
        priorProduction,
        priorSales,
        announcements,
      ] = await Promise.all([
        production
          ? db.milkReceipt.findMany({
              where: { approved: true, date: { gte: start, lt: end } },
              select: { date: true, liters: true },
            })
          : Promise.resolve([]),
        production
          ? db.productionOrder.findMany({
              where: { date: { gte: start, lt: end } },
              select: {
                date: true,
                quantityProduced: true,
                litersUsed: true,
                totalCost: true,
                product: { select: { name: true, unit: true } },
              },
            })
          : Promise.resolve([]),
        role !== 'PRODUCTION'
          ? db.order.findMany({
              where: { status: 'DELIVERED', delivery: { deliveredAt: { gte: start, lt: end } } },
              select: {
                total: true,
                delivery: { select: { deliveredAt: true } },
                items: { select: { quantity: true, batch: { select: { unitCost: true } } } },
              },
            })
          : Promise.resolve([]),
        role !== 'PRODUCTION'
          ? db.order.count({
              where: {
                status: { notIn: ['DELIVERED', 'CANCELLED'] },
                deliveryDate: { gte: start, lt: end },
              },
            })
          : Promise.resolve(0),
        role !== 'PRODUCTION'
          ? db.delivery.count({ where: { scheduledAt: { gte: start, lt: end } } })
          : Promise.resolve(0),
        production
          ? db.milkReceipt.aggregate({
              where: { approved: true, date: { gte: previousStart, lt: start } },
              _sum: { liters: true },
            })
          : Promise.resolve(null),
        production
          ? db.productionOrder.aggregate({
              where: { date: { gte: previousStart, lt: start }, product: { unit: 'kg' } },
              _sum: { quantityProduced: true },
            })
          : Promise.resolve(null),
        role !== 'PRODUCTION'
          ? db.order.aggregate({
              where: {
                status: 'DELIVERED',
                delivery: { deliveredAt: { gte: previousStart, lt: start } },
              },
              _sum: { total: true },
            })
          : Promise.resolve(null),
        db.announcement.findMany({
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            author: { select: { name: true } },
          },
        }),
      ]);
      const milk = receipts.reduce((s, r) => s + num(r.liters), 0);
      const kg = productions
        .filter((p) => p.product.unit === 'kg')
        .reduce((s, p) => s + num(p.quantityProduced), 0);
      const revenue = delivered.reduce((s, o) => s + num(o.total), 0);
      const soldCost = delivered.reduce(
        (s, o) => s + o.items.reduce((t, i) => t + num(i.quantity) * num(i.batch?.unitCost), 0),
        0,
      );
      const cost = productions.reduce((s, p) => s + num(p.totalCost), 0);
      const liters = productions.reduce((s, p) => s + num(p.litersUsed), 0);
      const kgCost = productions
        .filter((p) => p.product.unit === 'kg')
        .reduce((s, p) => s + num(p.totalCost), 0);
      const delta = (value: number, prior: number) =>
        prior === 0 ? null : round(((value - prior) / prior) * 100);
      const kpis: {
        key: string;
        label: string;
        value: number | null;
        unit: string;
        change: number | null;
      }[] = [];
      if (production)
        kpis.push(
          {
            key: 'milk',
            label: 'Leite recebido',
            value: round(milk),
            unit: 'L',
            change: delta(milk, num(priorReceipts?._sum.liters)),
          },
          {
            key: 'production',
            label: 'Produção de queijos e derivados',
            value: round(kg),
            unit: 'kg',
            change: delta(kg, num(priorProduction?._sum.quantityProduced)),
          },
        );
      if (role !== 'PRODUCTION')
        kpis.push({
          key: 'revenue',
          label: 'Faturamento entregue',
          value: round(revenue),
          unit: 'BRL',
          change: delta(revenue, num(priorSales?._sum.total)),
        });
      if (financial)
        kpis.push(
          {
            key: 'margin',
            label: 'Margem bruta',
            value: revenue ? round(((revenue - soldCost) / revenue) * 100) : null,
            unit: '%',
            change: null,
          },
          {
            key: 'costLiter',
            label: 'Custo por litro processado',
            value: liters ? round(cost / liters) : null,
            unit: 'BRL',
            change: null,
          },
          {
            key: 'costKg',
            label: 'Custo por kg produzido',
            value: kg ? round(kgCost / kg) : null,
            unit: 'BRL',
            change: null,
          },
        );
      if (role !== 'PRODUCTION')
        kpis.push(
          {
            key: 'orders',
            label: 'Pedidos em aberto no período',
            value: openOrders,
            unit: 'un',
            change: null,
          },
          {
            key: 'deliveries',
            label: 'Entregas no período',
            value: deliveryCount,
            unit: 'un',
            change: null,
          },
        );
      const series: Record<string, { date: string; milk: number; revenue: number }> = {};
      for (let d = +start; d < +end; d += 86400000) {
        const key = localDay(new Date(d));
        series[key] = { date: key, milk: 0, revenue: 0 };
      }
      for (const r of receipts) {
        const row = series[localDay(r.date)];
        if (row) row.milk = round(row.milk + num(r.liters));
      }
      for (const o of delivered) {
        if (o.delivery?.deliveredAt) {
          const row = series[localDay(o.delivery.deliveredAt)];
          if (row) row.revenue = round(row.revenue + num(o.total));
        }
      }
      const productTotals = new Map<string, { name: string; quantity: number; unit: string }>();
      for (const p of productions) {
        const current = productTotals.get(p.product.name) ?? {
          name: p.product.name,
          quantity: 0,
          unit: p.product.unit,
        };
        current.quantity = round(current.quantity + num(p.quantityProduced));
        productTotals.set(p.product.name, current);
      }
      const today = dateRange({ period: 'today' });
      const [nearExpiry, deliveries, awaiting, overdue] = await Promise.all([
        production
          ? db.batch.findMany({
              where: {
                expiresAt: {
                  gte: today.start,
                  lte: new Date(+today.start + company.expiryAlertDays * 86400000),
                },
                status: 'RELEASED',
                availableQuantity: { gt: 0 },
              },
              select: {
                id: true,
                code: true,
                expiresAt: true,
                availableQuantity: true,
                product: { select: { name: true, unit: true } },
              },
              orderBy: { expiresAt: 'asc' },
              take: 5,
            })
          : Promise.resolve([]),
        role !== 'PRODUCTION'
          ? db.delivery.findMany({
              where: { scheduledAt: { gte: today.start, lt: today.end } },
              include: {
                order: {
                  select: {
                    code: true,
                    status: true,
                    customer: { select: { name: true, city: true } },
                  },
                },
                route: { select: { name: true } },
              },
              orderBy: { stopNumber: 'asc' },
              take: 6,
            })
          : Promise.resolve([]),
        role !== 'PRODUCTION' ? db.order.count({ where: { status: 'NEW' } }) : Promise.resolve(0),
        financial
          ? db.receivable.findMany({
              where: { dueDate: { lt: today.start } },
              select: { amount: true, paidAmount: true },
            })
          : Promise.resolve([]),
      ]);
      return {
        expiryAlertDays: company.expiryAlertDays,
        period: {
          from: localDay(start),
          to: localDay(new Date(+end - 1)),
          timezone: 'America/Sao_Paulo',
        },
        kpis,
        series: Object.values(series),
        productionByProduct: [...productTotals.values()].sort((a, b) => b.quantity - a.quantity),
        nearExpiry,
        deliveries: deliveries.map((d) => ({
          id: d.id,
          orderCode: d.order.code,
          customer: d.order.customer.name,
          city: d.order.customer.city,
          status: d.order.status,
          route: d.route.name,
        })),
        awaitingConfirmation: awaiting,
        overdueAmount: financial
          ? round(overdue.reduce((s, r) => s + Math.max(0, num(r.amount) - num(r.paidAmount)), 0))
          : null,
        announcements,
      };
    },
  );
}
