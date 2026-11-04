import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Milk,
  Package,
  Wallet,
  TrendingUp,
  ShoppingBag,
  Truck,
  CalendarDays,
  Clock3,
  Leaf,
  TriangleAlert,
} from 'lucide-react';
import { api } from './lib/api';
import { useAuth } from './lib/auth';
import { currency, number, date, statusLabels, cn } from './lib/utils';
import { Loading, ErrorState, EmptyState } from './components/feedback';
import { Button } from './components/ui/button';
import { Badge } from './components/badge';
interface DashboardData {
  period: { from: string; to: string };
  kpis: { key: string; label: string; value: number | null; unit: string; change: number | null }[];
  series: { date: string; milk: number; revenue: number }[];
  productionByProduct: { name: string; quantity: number; unit: string }[];
  nearExpiry: {
    id: string;
    code: string;
    expiresAt: string;
    availableQuantity: string;
    product: { name: string; unit: string };
  }[];
  deliveries: {
    id: string;
    orderCode: string;
    customer: string;
    city: string;
    status: string;
    route: string;
  }[];
  awaitingConfirmation: number;
  overdueAmount: number | null;
  announcements: {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    author: { name: string };
  }[];
}
const icons: Record<string, typeof Milk> = {
  milk: Milk,
  production: Package,
  revenue: Wallet,
  margin: TrendingUp,
  costLiter: Milk,
  costKg: Package,
  orders: ShoppingBag,
  deliveries: Truck,
};
const periodLabels: Record<string, string> = {
  today: 'Hoje',
  '7': 'Últimos 7 dias',
  '30': 'Últimos 30 dias',
  month: 'Este mês',
  custom: 'Personalizado',
};
export default function Dashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [validation, setValidation] = useState('');
  const effective = period === 'custom' && !custom ? '30' : period;
  const query = new URLSearchParams({
    period: effective,
    ...(effective === 'custom' && custom ? custom : {}),
  });
  const data = useQuery({
    queryKey: ['dashboard', user!.id, effective, custom],
    queryFn: () => api<DashboardData>(`/dashboard?${query}`),
  });
  const now = new Date();
  const greeting = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  const hour = Number(greeting);
  const production = user!.role !== 'SALES';
  const todayLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> SEU NEGÓCIO, POR INTEIRO
          </p>
          <h1 className="page-title mt-2">
            {hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'},{' '}
            {user!.name.split(' ')[0]} <span className="ml-1 text-gold">☀</span>
          </h1>
          <p className="mt-2 text-xs leading-6 text-muted">
            Uma visão clara de tudo o que você cultiva todos os dias.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted sm:pt-8">
          <CalendarDays size={14} />
          {todayLabel}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-stone-200/80 bg-white p-1 dark:border-slate-800 dark:bg-slate-900"
          role="group"
          aria-label="Período dos indicadores"
        >
          {Object.entries(periodLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              aria-pressed={period === key}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-medium transition-colors',
                period === key
                  ? 'bg-forest text-white dark:bg-primary'
                  : 'text-stone-500 hover:bg-stone-50 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Dados reais do ambiente demo
        </span>
      </div>
      {period === 'custom' && (
        <form
          className="card flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from || !to || from > to) {
              setValidation('Informe a data inicial e final em ordem.');
              return;
            }
            if (+new Date(to) - +new Date(from) > 365 * 86400000) {
              setValidation('Selecione no máximo 366 dias.');
              return;
            }
            setValidation('');
            setCustom({ from, to });
          }}
        >
          <div>
            <label htmlFor="period-from">De</label>
            <input
              required
              id="period-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="period-to">Até</label>
            <input
              required
              id="period-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button type="submit">Aplicar período</Button>
          {validation && (
            <p role="alert" className="text-xs text-red-700">
              {validation}
            </p>
          )}
        </form>
      )}
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState
          message={data.error.message}
          retry={() => {
            void data.refetch();
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 xl:grid-cols-4">
            {data.data.kpis.map((k, i) => {
              const Icon = icons[k.key] ?? TrendingUp;
              return (
                <article key={k.key} className="card relative overflow-hidden p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="max-w-[180px] text-[11px] font-medium leading-5 text-muted">
                      {k.label}
                    </p>
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        i === 0
                          ? 'bg-primary/10 text-primary dark:text-green-300'
                          : i === 1
                            ? 'bg-[#e9b949]/15 text-[#8a6408] dark:text-yellow-300'
                            : 'bg-stone-100 text-stone-500 dark:bg-slate-800 dark:text-slate-400',
                      )}
                    >
                      <Icon size={16} strokeWidth={1.7} />
                    </span>
                  </div>
                  <p className="mt-3 font-heading text-[25px] font-bold tracking-[-1px] tabular-nums">
                    {k.unit === 'BRL' ? currency(k.value) : number(k.value, k.unit === '%' ? 1 : 0)}
                    {k.unit !== 'BRL' && (
                      <span className="ml-1.5 text-sm font-medium tracking-normal text-muted">
                        {k.unit}
                      </span>
                    )}
                  </p>
                  <p className="mt-3 flex items-center gap-1 text-[10px] text-muted">
                    {k.change !== null ? (
                      <>
                        <span
                          className={cn(
                            'flex items-center font-semibold',
                            k.change >= 0
                              ? 'text-primary dark:text-green-400'
                              : 'text-amber-700 dark:text-amber-300',
                          )}
                        >
                          {k.change >= 0 ? (
                            <ArrowUpRight size={12} />
                          ) : (
                            <ArrowDownRight size={12} />
                          )}{' '}
                          {number(Math.abs(k.change))}%
                        </span>
                        vs. período anterior
                      </>
                    ) : k.key === 'margin' ? (
                      'Sobre o faturamento entregue'
                    ) : k.key === 'costKg' ? (
                      'Somente produtos medidos em kg'
                    ) : k.key === 'costLiter' ? (
                      'Custo total da produção / litros'
                    ) : (
                      'No período selecionado'
                    )}
                  </p>
                </article>
              );
            })}
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
            <section className="card p-5 sm:p-6">
              <div className="mb-7 flex items-start justify-between gap-3">
                <div>
                  <h2 className="section-title">
                    {production
                      ? 'Leite que chega, negócio que cresce'
                      : 'Vendas que movimentam seu negócio'}
                  </h2>
                  <p className="mt-2 text-[11px] text-muted">
                    {production
                      ? 'Volume aprovado recebido por dia'
                      : 'Faturamento dos pedidos entregues por dia'}
                  </p>
                </div>
                <span className="rounded-lg bg-primary/5 px-2 py-1 text-[10px] font-medium text-primary dark:text-green-300">
                  {production ? 'Litros' : 'Reais'}
                </span>
              </div>
              <div
                className="h-[240px] w-full"
                role="img"
                aria-label={
                  production
                    ? 'Gráfico de leite recebido por dia'
                    : 'Gráfico de faturamento por dia'
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.data.series}
                    margin={{ top: 5, right: 8, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="milk-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2F7D4F" stopOpacity={0.17} />
                        <stop offset="100%" stopColor="#2F7D4F" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--chart-grid)"
                      strokeDasharray="4 4"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}`}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={30}
                      tick={{ fontSize: 10, fill: 'var(--muted)' }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'var(--muted)' }}
                      tickFormatter={(v) => number(Number(v), 0)}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid var(--chart-grid)',
                        background: 'var(--surface)',
                        fontSize: 12,
                      }}
                      labelFormatter={(v) => date(`${v}T12:00:00-03:00`)}
                      formatter={(value) => [
                        production ? `${number(Number(value))} L` : currency(Number(value)),
                        production ? 'Leite recebido' : 'Faturamento',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey={production ? 'milk' : 'revenue'}
                      stroke="#2F7D4F"
                      strokeWidth={2.5}
                      fill="url(#milk-fill)"
                      activeDot={{ r: 5, strokeWidth: 3, stroke: 'var(--surface)' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-4 border-t border-stone-100 pt-4 text-[10px] text-muted dark:border-slate-800">
                {date(`${data.data.period.from}T12:00:00-03:00`)} —{' '}
                {date(`${data.data.period.to}T12:00:00-03:00`)} · Horário de Brasília
              </p>
            </section>
            {production ? (
              <section className="card p-5 sm:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="section-title">Da nossa produção</h2>
                    <p className="mt-2 text-[11px] text-muted">
                      Produtos produzidos no período · kg
                    </p>
                  </div>
                  <Package size={18} className="text-muted" />
                </div>
                {data.data.productionByProduct.filter((p) => p.unit === 'kg').length ? (
                  <>
                    <div
                      className="mt-6 h-[230px]"
                      role="img"
                      aria-label="Produção por produto em quilogramas"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.data.productionByProduct
                            .filter((p) => p.unit === 'kg')
                            .slice(0, 6)}
                          layout="vertical"
                          margin={{ left: 0, right: 20 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={110}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10, fill: 'var(--muted)' }}
                            tickFormatter={(v) => String(v).replace('Queijo ', '')}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 12,
                              background: 'var(--surface)',
                              border: '1px solid var(--chart-grid)',
                              fontSize: 12,
                            }}
                            formatter={(v) => [`${number(Number(v))} kg`, 'Produção']}
                          />
                          <Bar dataKey="quantity" radius={[0, 5, 5, 0]} barSize={15}>
                            {data.data.productionByProduct
                              .filter((p) => p.unit === 'kg')
                              .slice(0, 6)
                              .map((p, i) => (
                                <Cell
                                  key={p.name}
                                  fill={
                                    [
                                      '#2F7D4F',
                                      '#568b57',
                                      '#8fa875',
                                      '#b3bd85',
                                      '#d6c479',
                                      '#E9B949',
                                    ][i]
                                  }
                                />
                              ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <Link
                      to="/products"
                      className="mt-2 flex items-center justify-center gap-2 border-t border-stone-100 pt-4 text-[11px] font-semibold text-primary dark:border-slate-800 dark:text-green-300"
                    >
                      Consultar produtos
                      <ArrowRight size={13} />
                    </Link>
                  </>
                ) : (
                  <EmptyState title="Sem produção neste período" />
                )}
              </section>
            ) : (
              <section className="card flex flex-col p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/20 text-earth">
                  <ShoppingBag size={22} />
                </span>
                <h2 className="mt-6 font-heading text-xl font-bold">
                  Relacionamentos que crescem.
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Acompanhe os pedidos e mantenha cada cliente por perto. Tudo o que você precisa
                  para começar uma boa conversa.
                </p>
                <div className="mt-auto flex flex-wrap gap-3 pt-8">
                  <Button asChild>
                    <Link to="/orders">
                      Consultar pedidos
                      <ArrowRight size={15} />
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/customers">Ver clientes</Link>
                  </Button>
                </div>
              </section>
            )}
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
            <section className="card p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary dark:text-green-300">
                    {production ? <Clock3 size={16} /> : <Truck size={16} />}
                  </span>
                  <h2 className="section-title">
                    {production ? 'Atenção aos próximos dias' : 'Entregas de hoje'}
                  </h2>
                </div>
                <Link
                  to={production ? '/batches' : '/deliveries'}
                  className="text-[11px] font-semibold text-primary dark:text-green-300"
                >
                  Ver todos <span aria-hidden="true">↗</span>
                </Link>
              </div>
              {production ? (
                data.data.nearExpiry.length ? (
                  <div className="divide-y divide-stone-100 dark:divide-slate-800">
                    {data.data.nearExpiry.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 py-3">
                        <div className="rounded-lg bg-gold/10 p-2 text-[#8a6408] dark:text-yellow-300">
                          <Package size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{b.product.name}</p>
                          <p className="mt-1 text-[10px] text-muted">{b.code}</p>
                        </div>
                        <span className="hidden text-xs text-muted sm:inline">
                          {number(Number(b.availableQuantity))} {b.product.unit}
                        </span>
                        <span className="rounded-lg bg-gold/15 px-2 py-1.5 text-[10px] font-medium text-[#805a06] dark:text-yellow-200">
                          Vence {date(b.expiresAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Validades em dia"
                    description="Nenhum lote liberado com saldo vence nos próximos sete dias."
                  />
                )
              ) : data.data.deliveries.length ? (
                <div className="divide-y divide-stone-100 dark:divide-slate-800">
                  {data.data.deliveries.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 py-4">
                      <div>
                        <p className="text-xs font-semibold">{d.customer}</p>
                        <p className="mt-1 text-[10px] text-muted">
                          {d.city} · {d.orderCode}
                        </p>
                      </div>
                      <Badge value={d.status}>{statusLabels[d.status]}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Nenhuma entrega para hoje"
                  description="As entregas agendadas aparecerão aqui."
                />
              )}
            </section>
            <div className="space-y-5">
              {user!.role !== 'PRODUCTION' && (
                <section className="rounded-2xl border border-gold/30 bg-[#fff8e7] p-5 dark:border-yellow-800/50 dark:bg-yellow-950/20">
                  <div className="mb-3 flex items-center gap-2 text-[#795b13] dark:text-yellow-300">
                    <TriangleAlert size={16} />
                    <h2 className="text-xs font-bold">Precisam do seu olhar</h2>
                  </div>
                  <Link to="/orders" className="flex items-center justify-between py-2 text-xs">
                    <span className="text-stone-600 dark:text-slate-300">
                      Pedidos aguardando confirmação
                    </span>
                    <span className="font-bold">{data.data.awaitingConfirmation} →</span>
                  </Link>
                  {data.data.overdueAmount !== null && (
                    <Link
                      to="/finance"
                      className="mt-2 flex items-center justify-between border-t border-gold/20 pt-3 text-xs"
                    >
                      <span className="text-stone-600 dark:text-slate-300">
                        Contas a receber vencidas
                      </span>
                      <span className="font-bold">{currency(data.data.overdueAmount)} →</span>
                    </Link>
                  )}
                </section>
              )}
              <section className="card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="section-title">Recados do campo</h2>
                  <Leaf size={16} className="text-primary dark:text-green-300" />
                </div>
                {data.data.announcements.slice(0, 2).map((a) => (
                  <article key={a.id} className="mt-4 border-l-2 border-primary/20 pl-3">
                    <h3 className="text-xs font-semibold">{a.title}</h3>
                    <p className="mt-2 text-[11px] leading-5 text-muted">{a.content}</p>
                    <p className="mt-2 text-[9px] text-muted">
                      {a.author.name} · {date(a.createdAt)}
                    </p>
                  </article>
                ))}
              </section>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-primary/10 bg-primary/[.035] px-4 py-3 text-[10px] text-muted">
            <Leaf size={14} className="shrink-0 text-primary" />
            Cada número conta uma história. Aqui, ela começa na origem.
          </div>
        </>
      )}
    </div>
  );
}
