import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Download, ChartNoAxesCombined, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from './lib/api';
import { useAuth } from './lib/auth';
import { currency, date, number, statusLabels } from './lib/utils';
import { downloadFile } from './traceability';
import { Button } from './components/ui/button';
import { Loading, ErrorState } from './components/feedback';
interface Report {
  total: number;
  limit: number;
  page: number;
  title: string;
  type: string;
  columns: { key: string; label: string; kind?: 'money' | 'number' | 'date' }[];
  rows: Record<string, string | number | null>[];
  summary: Record<string, number | null>;
  series: { date: string; primary: number; secondary: number }[];
  chartUnit: string;
  note: string;
}
export default function Reports() {
  const { user } = useAuth();
  const options =
    user!.role === 'PRODUCTION'
      ? [
          ['production', 'Produção e rendimento'],
          ['milk', 'Recebimento e qualidade'],
          ['stock', 'Estoque valorizado'],
        ]
      : user!.role === 'SALES'
        ? [['sales', 'Vendas por cliente e produto']]
        : [
            ['sales', 'Vendas por cliente e produto'],
            ['production', 'Produção e rendimento'],
            ['milk', 'Recebimento e qualidade'],
            ['stock', 'Estoque valorizado'],
            ['finance', 'Financeiro · caixa e DRE'],
          ];
  const [search] = useSearchParams();
  const requested = search.get('type');
  const [type, setType] = useState(
    options.some((o) => o[0] === requested) ? requested! : options[0][0],
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const lookups = useQuery({
    queryKey: ['lookups', user!.id],
    queryFn: () =>
      api<{
        customers: { id: string; name: string }[];
        products: { id: string; name: string }[];
        producers: { id: string; name: string }[];
      }>('/ops/lookups'),
  });
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [page, setPage] = useState(1);
  const effective = period === 'custom' && !custom ? 'month' : period;
  const params = new URLSearchParams({
    type,
    period: effective,
    ...(effective === 'custom' && custom ? custom : {}),
    ...filters,
    page: String(page),
    limit: '25',
  });
  const data = useQuery({
    queryKey: ['reports', type, effective, custom, user!.id, filters, page],
    queryFn: () => api<Report>(`/reports?${params}`),
  });
  const exportReport = (format: string) => {
    void downloadFile(`/reports?${params}&format=${format}`, `agro-certa-${type}.${format}`).catch(
      (e: Error) => toast.error(e.message),
    );
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">DECISÕES COM CLAREZA</p>
          <h1 className="page-title mt-2">Relatórios</h1>
          <p className="mt-2 text-sm text-muted">
            Consulte os registros e acompanhe o resultado da operação.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!data.data} onClick={() => exportReport('csv')}>
            <Download size={15} />
            CSV
          </Button>
          <Button disabled={!data.data} onClick={() => exportReport('pdf')}>
            <Download size={15} />
            PDF
          </Button>
        </div>
      </div>
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="report-type">Relatório</label>
          <select
            id="report-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setFilters({});
              setPage(1);
            }}
          >
            {options.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="report-period">Período</label>
          <select
            id="report-period"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
            {[
              ['today', 'Hoje'],
              ['7', 'Últimos 7 dias'],
              ['30', 'Últimos 30 dias'],
              ['month', 'Este mês'],
              ['custom', 'Personalizado'],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {(type === 'sales'
          ? [
              ['customerId', 'Cliente', 'customers'],
              ['productId', 'Produto', 'products'],
            ]
          : type === 'milk'
            ? [['producerId', 'Produtor', 'producers']]
            : type === 'finance'
              ? []
              : [['productId', 'Produto', 'products']]
        ).map(([key, label, list]) => (
          <div key={key}>
            <label htmlFor={`report-filter-${key}`}>{label}</label>
            <select
              id={`report-filter-${key}`}
              value={filters[key] ?? ''}
              onChange={(e) => {
                setFilters((f) => {
                  const next = { ...f };
                  if (e.target.value) next[key] = e.target.value;
                  else delete next[key];
                  return next;
                });
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {lookups.data?.[list as 'products'].map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        {period === 'custom' && (
          <form
            className="grid gap-3 sm:col-span-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!from || !to || from > to) {
                toast.error('Informe um período válido.');
                return;
              }
              setCustom({ from, to });
              setPage(1);
            }}
          >
            <div>
              <label htmlFor="report-from">De</label>
              <input
                id="report-from"
                required
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="report-to">Até</label>
              <input
                id="report-to"
                required
                type="date"
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button type="submit" className="self-end">
              Aplicar
            </Button>
          </form>
        )}
      </div>
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
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Object.entries(data.data.summary).map(([label, value]) => (
              <article key={label} className="card p-4">
                <p className="text-[11px] leading-5 text-muted">{label}</p>
                <p className="mt-3 font-heading text-xl font-bold tabular-nums">
                  {label.includes('%')
                    ? `${number(value)}%`
                    : /Litros|Produção em|Pedidos|Lotes/.test(label)
                      ? number(value)
                      : currency(value)}
                </p>
              </article>
            ))}
          </div>
          <section className="card p-5">
            <h2 className="section-title flex items-center gap-2">
              <ChartNoAxesCombined size={17} />
              {data.data.title}
            </h2>
            <p className="mt-3 text-xs leading-6 text-muted">{data.data.note}</p>
            <div className="mt-6 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.data.series} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                    tick={{ fontSize: 10, fill: 'var(--muted)' }}
                    tickFormatter={(v) =>
                      /^\d{4}-/.test(String(v))
                        ? `${String(v).slice(8)}/${String(v).slice(5, 7)}`
                        : String(v).slice(0, 18)
                    }
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => number(Number(v), 0)}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      background: 'var(--surface)',
                      border: '1px solid var(--chart-grid)',
                    }}
                    formatter={(v) =>
                      data.data.chartUnit === 'BRL'
                        ? currency(Number(v))
                        : `${number(Number(v))} ${data.data.chartUnit}`
                    }
                  />
                  <Area
                    dataKey="primary"
                    name={
                      type === 'finance'
                        ? 'Entradas'
                        : type === 'sales'
                          ? 'Faturamento'
                          : 'Volume / valor'
                    }
                    type="monotone"
                    fill="#2F7D4F"
                    fillOpacity={0.1}
                    stroke="#2F7D4F"
                    strokeWidth={2}
                  />
                  {(type === 'finance' || (type === 'sales' && user!.role === 'OWNER')) && (
                    <Area
                      dataKey="secondary"
                      name={type === 'finance' ? 'Saídas' : 'Custo vendido'}
                      type="monotone"
                      stroke="#b38a25"
                      fill="#E9B949"
                      fillOpacity={0.12}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">{data.data.title}</caption>
                <thead>
                  <tr className="bg-stone-50 dark:bg-slate-800">
                    {data.data.columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold text-muted"
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.rows.map((row, i) => (
                    <tr key={i}>
                      {data.data.columns.map((c) => (
                        <td key={c.key} className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {row[c.key] === null
                            ? '—'
                            : c.kind === 'date'
                              ? date(String(row[c.key]))
                              : c.kind === 'money'
                                ? currency(Number(row[c.key]))
                                : c.kind === 'number'
                                  ? number(Number(row[c.key]), 4)
                                  : (statusLabels[String(row[c.key])] ?? String(row[c.key]))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.data.rows.length && (
              <p className="p-10 text-center text-sm text-muted">Nenhum registro neste período.</p>
            )}
            <div className="flex items-center justify-between border-t p-4">
              <p className="text-xs text-muted">{data.data.total} registros</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Página anterior do relatório"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={15} />
                </Button>
                <span className="text-xs">{page}</span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Próxima página do relatório"
                  disabled={page * 25 >= data.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
