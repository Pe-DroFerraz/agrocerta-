import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from './db.js';
import { authorize } from './auth.js';
import { dateRange, periodSchema, localDay } from './dates.js';
import { D, fail } from './operations-core.js';
import { pdf } from './traceability.js';
type Cell = string | number | null;
type Column = { key: string; label: string; kind?: 'money' | 'number' | 'date' };
export async function reportData(
  type: string,
  range: { start: Date; end: Date },
  financial: boolean,
  filters: { productId?: string; customerId?: string; producerId?: string } = {},
) {
  const between = { gte: range.start, lt: range.end };
  let title = '';
  let columns: Column[] = [];
  let rows: Record<string, Cell>[] = [];
  const summary: Record<string, number | null> = {};
  const series = new Map<string, { date: string; primary: number; secondary: number }>();
  let chartUnit = 'BRL';
  for (let t = +range.start; t < +range.end; t += 86400000) {
    const key = localDay(new Date(t));
    series.set(key, { date: key, primary: 0, secondary: 0 });
  }
  const add = (date: Date, primary: number, secondary = 0) => {
    const entry = series.get(localDay(date));
    if (entry) {
      entry.primary += primary;
      entry.secondary += secondary;
    }
  };
  if (type === 'sales' || type === 'finance') {
    const orders = await db.order.findMany({
      where: { status: 'DELIVERED', delivery: { deliveredAt: between } },
      include: {
        customer: true,
        delivery: true,
        items: { include: { product: true, batch: true } },
      },
    });
    const revenue = orders.reduce((s, o) => s.plus(o.total), D(0));
    const cogs = orders.reduce(
      (s, o) =>
        s.plus(o.items.reduce((t, i) => t.plus(i.quantity.mul(i.batch?.unitCost ?? 0)), D(0))),
      D(0),
    );
    if (type === 'sales') {
      title = 'Vendas por cliente, produto e lote';
      columns = [
        { key: 'date', label: 'Entrega', kind: 'date' },
        { key: 'order', label: 'Pedido' },
        { key: 'customer', label: 'Cliente' },
        { key: 'product', label: 'Produto' },
        { key: 'batch', label: 'Lote' },
        { key: 'quantity', label: 'Quantidade', kind: 'number' },
        { key: 'unit', label: 'Unidade' },
        { key: 'revenue', label: 'Faturamento', kind: 'money' },
        ...(financial
          ? [
              { key: 'cost', label: 'Custo vendido', kind: 'money' as const },
              { key: 'margin', label: 'Margem (%)', kind: 'number' as const },
            ]
          : []),
      ];
      rows = orders.flatMap((o) =>
        o.items.map((i) => {
          const value = i.quantity.mul(i.unitPrice).minus(i.discount);
          const cost = i.quantity.mul(i.batch?.unitCost ?? 0);
          return {
            customerId: o.customerId,
            productId: i.productId,
            date: o.delivery!.deliveredAt!.toISOString(),
            order: o.code,
            customer: o.customer.name,
            product: i.product.name,
            batch: i.batch?.code ?? 'Sem lote',
            quantity: Number(i.quantity),
            unit: i.product.unit,
            revenue: Number(value.toFixed(2)),
            ...(financial
              ? {
                  cost: Number(cost.toFixed(2)),
                  margin: value.gt(0)
                    ? Number(value.minus(cost).div(value).mul(100).toFixed(2))
                    : null,
                }
              : {}),
          };
        }),
      );
      for (const o of orders)
        add(
          o.delivery!.deliveredAt!,
          Number(o.total),
          financial
            ? Number(o.items.reduce((s, i) => s.plus(i.quantity.mul(i.batch?.unitCost ?? 0)), D(0)))
            : 0,
        );
      summary['Faturamento entregue'] = Number(revenue.toFixed(2));
      summary['Pedidos entregues'] = orders.length;
      if (financial) {
        summary['Custo dos produtos vendidos'] = Number(cogs.toFixed(2));
        summary['Margem bruta (%)'] = revenue.gt(0)
          ? Number(revenue.minus(cogs).div(revenue).mul(100).toFixed(2))
          : null;
      }
      rows = rows.filter(
        (r) =>
          (!filters.customerId || r.customerId === filters.customerId) &&
          (!filters.productId || r.productId === filters.productId),
      );
      const filteredRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
      const filteredCost = rows.reduce((s, r) => s + Number(r.cost ?? 0), 0);
      summary['Faturamento entregue'] = Number(filteredRevenue.toFixed(2));
      summary['Pedidos entregues'] = new Set(rows.map((r) => r.order)).size;
      if (financial) {
        summary['Custo dos produtos vendidos'] = Number(filteredCost.toFixed(2));
        summary['Margem bruta (%)'] = filteredRevenue
          ? Number((((filteredRevenue - filteredCost) / filteredRevenue) * 100).toFixed(2))
          : null;
      }
      for (const entry of series.values()) {
        entry.primary = 0;
        entry.secondary = 0;
      }
      rows.forEach((r) => add(new Date(String(r.date)), Number(r.revenue), Number(r.cost ?? 0)));
    } else {
      title = 'Fluxo de caixa e DRE gerencial';
      const [incoming, outgoing, losses, fixed, production, adjustments] = await Promise.all([
        db.receivablePayment.findMany({
          where: { date: between },
          include: { receivable: { include: { order: true } } },
        }),
        db.payablePayment.findMany({ where: { date: between }, include: { payable: true } }),
        db.lossRecord.aggregate({ where: { date: between }, _sum: { cost: true } }),
        db.fixedCost.findMany(),
        db.productionOrder.findMany({ select: { date: true } }),
        db.stockMovement.findMany({
          where: { type: 'ADJUSTMENT', date: between, batchId: { not: null } },
          include: { batch: { select: { unitCost: true } } },
        }),
      ]);
      const producedMonths = new Set(production.map((p) => localDay(p.date).slice(0, 7)));
      let unallocated = D(0);
      for (const f of fixed) {
        if (producedMonths.has(f.month)) continue;
        const start = new Date(`${f.month}-01T00:00:00-03:00`);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        const overlap = Math.max(0, Math.min(+range.end, +end) - Math.max(+range.start, +start));
        unallocated = unallocated.plus(f.amount.mul(overlap).div(+end - +start));
      }
      const inTotal = incoming.reduce((s, p) => s.plus(p.amount), D(0));
      const outTotal = outgoing.reduce((s, p) => s.plus(p.amount), D(0));
      const loss = D(losses._sum.cost ?? 0);
      const variance = adjustments.reduce(
        (s, m) => s.minus(m.quantity.mul(m.batch?.unitCost ?? 0)),
        D(0),
      );
      const result = revenue.minus(cogs).minus(loss).minus(unallocated).minus(variance);
      Object.assign(summary, {
        'Receita por competência': Number(revenue.toFixed(2)),
        'Custo dos produtos vendidos': Number(cogs.toFixed(2)),
        'Perdas de estoque': Number(loss.toFixed(2)),
        'Variação de inventário': Number(variance.toFixed(2)),
        'Fixos sem produção (proporcional)': Number(unallocated.toFixed(2)),
        'Resultado gerencial': Number(result.toFixed(2)),
        'Entradas de caixa': Number(inTotal.toFixed(2)),
        'Saídas de caixa': Number(outTotal.toFixed(2)),
        'Saldo de caixa do período': Number(inTotal.minus(outTotal).toFixed(2)),
      });
      columns = [
        { key: 'date', label: 'Data', kind: 'date' },
        { key: 'direction', label: 'Movimento' },
        { key: 'reference', label: 'Referência' },
        { key: 'method', label: 'Forma' },
        { key: 'amount', label: 'Valor', kind: 'money' },
      ];
      rows = [
        ...incoming.map((p) => ({
          date: p.date.toISOString(),
          direction: 'Entrada',
          reference: p.receivable.order.code,
          method: p.method,
          amount: Number(p.amount),
        })),
        ...outgoing.map((p) => ({
          date: p.date.toISOString(),
          direction: 'Saída',
          reference: p.payable.description,
          method: p.method,
          amount: Number(p.amount),
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      incoming.forEach((p) => add(p.date, Number(p.amount)));
      outgoing.forEach((p) => add(p.date, 0, Number(p.amount)));
    }
  } else if (type === 'production') {
    title = 'Produção, rendimento e custos';
    chartUnit = 'kg eq.';
    const production = await db.productionOrder.findMany({
      where: { date: between, ...(filters.productId ? { productId: filters.productId } : {}) },
      include: { product: true, batch: true },
      orderBy: { date: 'asc' },
    });
    columns = [
      { key: 'date', label: 'Produção', kind: 'date' },
      { key: 'batch', label: 'Lote' },
      { key: 'product', label: 'Produto' },
      { key: 'liters', label: 'Leite (L)', kind: 'number' },
      { key: 'quantity', label: 'Quantidade', kind: 'number' },
      { key: 'unit', label: 'Unidade' },
      { key: 'yield', label: 'L / unidade', kind: 'number' },
      { key: 'expected', label: 'Rendimento esperado', kind: 'number' },
      { key: 'cost', label: 'Custo do lote', kind: 'money' },
      { key: 'unitCost', label: 'Custo por unidade', kind: 'money' },
    ];
    rows = production.map((p) => ({
      date: p.date.toISOString(),
      batch: p.batch?.code ?? '',
      product: p.product.name,
      liters: Number(p.litersUsed),
      quantity: Number(p.quantityProduced),
      unit: p.product.unit,
      yield: Number(p.litersUsed.div(p.quantityProduced).toFixed(3)),
      expected: Number(p.product.expectedLitersPerUnit),
      cost: Number(p.totalCost),
      unitCost: Number(p.totalCost.div(p.quantityProduced).toFixed(4)),
    }));
    summary['Litros processados'] = production.reduce((s, p) => s + Number(p.litersUsed), 0);
    summary['Produção em kg equivalentes'] = production.reduce(
      (s, p) => s + Number(p.quantityProduced.mul(p.product.kgPerUnit)),
      0,
    );
    summary['Custo de produção'] = production.reduce((s, p) => s + Number(p.totalCost), 0);
    production.forEach((p) => add(p.date, Number(p.quantityProduced.mul(p.product.kgPerUnit))));
  } else if (type === 'milk') {
    title = 'Recebimento e qualidade por produtor';
    chartUnit = 'L';
    const receipts = await db.milkReceipt.findMany({
      where: { date: between, ...(filters.producerId ? { producerId: filters.producerId } : {}) },
      include: { producer: true },
      orderBy: { date: 'asc' },
    });
    columns = [
      { key: 'date', label: 'Data', kind: 'date' },
      { key: 'producer', label: 'Produtor' },
      { key: 'liters', label: 'Litros', kind: 'number' },
      { key: 'temperature', label: 'Temperatura', kind: 'number' },
      { key: 'acidity', label: 'Acidez', kind: 'number' },
      { key: 'status', label: 'Qualidade' },
      { key: 'value', label: 'Valor aprovado', kind: 'money' },
    ];
    rows = receipts.map((r) => ({
      date: r.date.toISOString(),
      producer: r.producer.name,
      liters: Number(r.liters),
      temperature: Number(r.temperature),
      acidity: Number(r.acidity),
      status: r.approved ? 'Aprovado' : 'Reprovado',
      value: r.approved ? Number(r.liters.mul(r.pricePerLiter).toFixed(2)) : 0,
    }));
    summary['Litros aprovados'] = receipts
      .filter((r) => r.approved)
      .reduce((s, r) => s + Number(r.liters), 0);
    summary['Litros reprovados'] = receipts
      .filter((r) => !r.approved)
      .reduce((s, r) => s + Number(r.liters), 0);
    summary['Valor do leite aprovado'] = rows.reduce((s, r) => s + Number(r.value), 0);
    receipts.filter((r) => r.approved).forEach((r) => add(r.date, Number(r.liters)));
  } else {
    title = 'Posição atual de estoque ao custo';
    const batches = await db.batch.findMany({
      where: filters.productId ? { productId: filters.productId } : {},
      include: { product: true },
      orderBy: { expiresAt: 'asc' },
    });
    columns = [
      { key: 'product', label: 'Produto' },
      { key: 'batch', label: 'Lote' },
      { key: 'expiresAt', label: 'Validade', kind: 'date' },
      { key: 'status', label: 'Situação' },
      { key: 'quantity', label: 'Saldo físico', kind: 'number' },
      { key: 'reserved', label: 'Reservado', kind: 'number' },
      { key: 'unit', label: 'Unidade' },
      { key: 'value', label: 'Valor ao custo', kind: 'money' },
    ];
    rows = batches.map((b) => ({
      product: b.product.name,
      batch: b.code,
      expiresAt: b.expiresAt.toISOString(),
      status: b.status,
      quantity: Number(b.availableQuantity),
      reserved: Number(b.reservedQuantity),
      unit: b.product.unit,
      value: Number(b.availableQuantity.mul(b.unitCost).toFixed(2)),
    }));
    summary['Valor contábil do saldo'] = rows.reduce((s, r) => s + Number(r.value), 0);
    summary['Lotes com saldo'] = batches.filter((b) => b.availableQuantity.gt(0)).length;
    series.clear();
    for (const b of batches) {
      const group = series.get(b.product.name) ?? {
        date: b.product.name,
        primary: 0,
        secondary: 0,
      };
      group.primary += Number(b.availableQuantity.mul(b.unitCost));
      series.set(b.product.name, group);
    }
  }
  if (rows.length > 10000)
    fail(
      'O relatório excede 10.000 linhas. Filtre por produto/cliente ou selecione um intervalo menor.',
      400,
    );
  return {
    title,
    type,
    columns,
    rows,
    summary,
    series: [...series.values()],
    chartUnit,
    period: { from: localDay(range.start), to: localDay(new Date(+range.end - 1)) },
    asOf: new Date().toISOString(),
    note:
      type === 'stock'
        ? 'Posição atual, incluindo saldos bloqueados e vencidos; não representa estoque retroativo.'
        : type === 'finance'
          ? 'DRE por absorção: o custo vendido já contém rateio. Fixos sem produção são despesas proporcionais; o restante permanece no custo dos lotes. DEMO_OPENING identifica pagamentos iniciais da demonstração.'
          : 'Registros persistidos no intervalo selecionado.',
  };
}
export async function reportRoutes(app: FastifyInstance) {
  app.get('/api/reports', { preHandler: authorize('reports') }, async (request, reply) => {
    const q = z
      .object({
        type: z.enum(['sales', 'production', 'milk', 'stock', 'finance']).optional(),
        period: z.enum(['today', '7', '30', 'month', 'custom']).default('month'),
        from: z.string().optional(),
        to: z.string().optional(),
        format: z.enum(['json', 'csv', 'pdf']).default('json'),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(25),
        productId: z.string().min(1).max(100).optional(),
        customerId: z.string().min(1).max(100).optional(),
        producerId: z.string().min(1).max(100).optional(),
      })
      .strict()
      .parse(request.query);
    const type = q.type ?? (request.viewer.role === 'PRODUCTION' ? 'production' : 'sales');
    if (
      (request.viewer.role === 'PRODUCTION' && !['production', 'milk', 'stock'].includes(type)) ||
      (request.viewer.role === 'SALES' && type !== 'sales')
    )
      fail('Seu papel não permite este relatório.', 403);
    const data = await reportData(
      type,
      dateRange(periodSchema.parse({ period: q.period, from: q.from, to: q.to })),
      request.viewer.role === 'OWNER',
      { productId: q.productId, customerId: q.customerId, producerId: q.producerId },
    );
    const display = (row: Record<string, Cell>, column: Column) => {
      const value = row[column.key];
      if (value === null || value === undefined) return '—';
      if (column.kind === 'date')
        return new Date(String(value)).toLocaleDateString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        });
      if (column.kind === 'money')
        return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      if (column.kind === 'number')
        return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
      return String(value);
    };
    if (q.format === 'csv') {
      const escape = (s: string) =>
        `"${(/^(?:\s*[=+@-]|[\t\r\n])/.test(s) ? "'" : '') + s.replaceAll('"', '""')}"`;
      return reply
        .type('text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="agro-${type}.csv"`)
        .send(
          '\ufeff' +
            [
              data.columns.map((c) => escape(c.label)).join(';'),
              ...data.rows.map((r) => data.columns.map((c) => escape(display(r, c))).join(';')),
            ].join('\r\n'),
        );
    }
    if (q.format === 'pdf')
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="agro-${type}.pdf"`)
        .send(
          await pdf(data.title, [
            `Periodo: ${data.period.from} a ${data.period.to}`,
            data.note,
            ...Object.entries(data.summary).map(
              ([k, v]) => `${k}: ${v === null ? '—' : v.toLocaleString('pt-BR')}`,
            ),
            data.columns.map((c) => c.label).join(' | '),
            ...data.rows.map((row) => data.columns.map((c) => display(row, c)).join(' | ')),
          ]),
        );
    return {
      ...data,
      rows: data.rows.slice((q.page - 1) * q.limit, q.page * q.limit),
      total: data.rows.length,
      page: q.page,
      limit: q.limit,
    };
  });
}
