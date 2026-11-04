import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Warehouse, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from './lib/api';
import { currency, date, number, statusLabels } from './lib/utils';
import { Button } from './components/ui/button';
import { Badge } from './components/badge';
import { OperationalDialog, RecordActions, type OperationSelection } from './components/operations';
import { Loading, ErrorState, EmptyState } from './components/feedback';
interface Batch {
  id: string;
  code: string;
  status: string;
  expiresAt: string;
  availableQuantity: string;
  reservedQuantity: string;
  unitCost: string;
  product: { name: string; unit: string };
  [key: string]: unknown;
}
interface Position {
  batches: Batch[];
  value: string;
  total: number;
  releasedLots: number;
  reservedLots: number;
  lowSupplyCount: number;
}
export default function Stock() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [operation, setOperation] = useState<OperationSelection | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const data = useQuery({
    queryKey: ['stock-position', query, page],
    queryFn: () =>
      api<Position>(
        `/stock?${new URLSearchParams({ search: query, page: String(page), limit: '25' })}`,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">CADA LOTE, NO SEU LUGAR</p>
          <h1 className="page-title mt-2">Estoque por lote</h1>
          <p className="mt-3 text-sm text-muted">
            Saldo físico, reservas, validade, perdas e inventário.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/supplies">Insumos e entradas</Link>
          </Button>
          <Button asChild>
            <Link to="/reports?type=stock">Relatório valorizado</Link>
          </Button>
        </div>
      </div>
      {data.data && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Saldo filtrado ao custo', currency(Number(data.data.value))],
            ['Lotes liberados', String(data.data.releasedLots)],
            ['Lotes com reserva', String(data.data.reservedLots)],
            ['Insumos abaixo do mínimo', String(data.data.lowSupplyCount)],
          ].map(([label, value]) => (
            <article key={label} className="card p-5">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="mt-3 font-heading text-xl font-bold tabular-nums">{value}</p>
            </article>
          ))}
        </div>
      )}
      <section className="card overflow-hidden">
        <div className="border-b p-5">
          <label htmlFor="stock-search" className="sr-only">
            Buscar no estoque
          </label>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-3 text-muted" />
            <input
              id="stock-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              placeholder="Buscar por produto ou lote…"
            />
          </div>
        </div>
        {data.isPending ? (
          <div className="p-5">
            <Loading />
          </div>
        ) : data.error ? (
          <ErrorState
            message={data.error.message}
            retry={() => {
              void data.refetch();
            }}
          />
        ) : !data.data.batches.length ? (
          <EmptyState title="Nenhum lote com saldo nesta busca" />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.data.batches.map((b) => (
              <article key={b.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <Warehouse size={18} className="shrink-0 text-primary" />
                  <Badge value={b.status}>{statusLabels[b.status]}</Badge>
                </div>
                <h2 className="mt-4 text-sm font-semibold">{b.product.name}</h2>
                <p className="mt-2 break-all text-[10px] text-muted">{b.code}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted">Saldo físico</dt>
                    <dd className="mt-1 font-semibold">
                      {number(Number(b.availableQuantity), 3)} {b.product.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Reservado</dt>
                    <dd className="mt-1 font-semibold">
                      {number(Number(b.reservedQuantity), 3)} {b.product.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Validade</dt>
                    <dd
                      className={`mt-1 font-semibold ${new Date(b.expiresAt) < new Date() ? 'text-red-700 dark:text-red-300' : ''}`}
                    >
                      {date(b.expiresAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Custo por unidade</dt>
                    <dd className="mt-1 font-semibold">{currency(Number(b.unitCost))}</dd>
                  </div>
                </dl>
                <div className="mt-4 border-t pt-3">
                  <RecordActions resource="batches" row={b} onSelect={setOperation} />
                </div>
              </article>
            ))}
          </div>
        )}
        {data.data && (
          <div className="flex items-center justify-between border-t p-4">
            <p className="text-xs text-muted">{data.data.total} lotes com saldo</p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                aria-label="Página anterior do estoque"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={15} />
              </Button>
              <span className="text-xs">{page}</span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Próxima página do estoque"
                disabled={page * 25 >= data.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}
      </section>
      {operation && <OperationalDialog selection={operation} onClose={() => setOperation(null)} />}
    </div>
  );
}
