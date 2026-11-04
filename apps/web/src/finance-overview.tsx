import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from './lib/api';
import { useAuth } from './lib/auth';
import { Button } from './components/ui/button';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { currency, date } from './lib/utils';
import { RecordActions } from './components/operations';
import { ErrorState } from './components/feedback';
interface Payable {
  id: string;
  description: string;
  category: string;
  amount: string;
  paidAmount: string;
  dueDate: string;
  [key: string]: unknown;
}
interface Summary {
  receivableBalance: string;
  payableBalance: string;
  cashIn: string;
  cashOut: string;
  lossCost: string;
}
export function FinancialOverview() {
  const summary = useQuery({
    queryKey: ['financial-summary'],
    queryFn: () => api<Summary>('/finance/summary'),
  });
  const payables = useQuery({
    queryKey: ['payables'],
    queryFn: () => api<{ rows: Payable[] }>('/payables'),
  });
  if (summary.error || payables.error)
    return (
      <ErrorState
        message={(summary.error ?? payables.error)!.message}
        retry={() => {
          void summary.refetch();
          void payables.refetch();
        }}
      />
    );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['A receber', summary.data?.receivableBalance],
          ['A pagar', summary.data?.payableBalance],
          ['Entradas registradas', summary.data?.cashIn],
          ['Saídas registradas', summary.data?.cashOut],
        ].map(([label, value]) => (
          <article key={label} className="card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-3 font-heading text-xl font-bold tabular-nums">
              {value === undefined ? '…' : currency(Number(value))}
            </p>
          </article>
        ))}
      </div>
      <section className="card p-5">
        <h2 className="section-title">Contas a pagar</h2>
        <p className="mt-2 text-xs text-muted">
          Pagamentos totais ou parciais. Recebimentos de leite e compras geram contas
          automaticamente.
        </p>
        <div className="mt-5 max-h-96 space-y-3 overflow-auto">
          {payables.isPending ? (
            <p role="status">Carregando…</p>
          ) : (
            payables.data?.rows.map((p) => (
              <article
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div>
                  <p className="text-xs font-semibold">{p.description}</p>
                  <p className="mt-2 text-[11px] text-muted">
                    Vence {date(p.dueDate)} · Saldo{' '}
                    {currency(Number(p.amount) - Number(p.paidAmount))}
                  </p>
                </div>
                <RecordActions resource="payables" row={p} />
              </article>
            ))
          )}
        </div>
      </section>
      <CostSimulator />
      <h2 className="section-title">Contas a receber</h2>
    </div>
  );
}

function CostSimulator() {
  const { user } = useAuth();
  const lookup = useQuery({
    queryKey: ['lookups', user!.id],
    queryFn: () => api<{ products: { id: string; name: string }[] }>('/ops/lookups'),
  });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [productId, setProductId] = useState('');
  const [delta, setDelta] = useState('0.20');
  const simulation = useMutation({
    mutationFn: () =>
      api<{
        rows: {
          code: string;
          product: string;
          unit: string;
          currentCost: number;
          simulatedCost: number;
          deltaTotal: number;
          margin: number | null;
        }[];
      }>('/finance/simulate', {
        method: 'POST',
        body: JSON.stringify({ month, delta: Number(delta), ...(productId ? { productId } : {}) }),
      }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">E se o preço do leite mudar?</h2>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-muted">
            Simule o impacto nos lotes reais do mês, mantendo insumos e rateio. A margem usa o preço
            de tabela. A simulação não altera os registros.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/reports?type=finance">Fluxo de caixa e DRE</Link>
        </Button>
      </div>
      <form
        className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_2fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          simulation.mutate();
        }}
      >
        <div>
          <label htmlFor="simulate-month">Mês de produção</label>
          <input
            required
            id="simulate-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="simulate-product">Produto da simulação</label>
          <select
            id="simulate-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Todos os produtos</option>
            {lookup.data?.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="simulate-delta">Variação por litro (R$)</label>
          <input
            required
            id="simulate-delta"
            type="number"
            step=".01"
            min="-5"
            max="20"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={simulation.isPending} className="self-end">
          Simular custo
        </Button>
      </form>
      {simulation.data && (
        <div className="mt-5 max-h-80 space-y-3 overflow-auto">
          {simulation.data.rows.length ? (
            simulation.data.rows.map((row, i) => (
              <article
                key={i}
                className="flex flex-wrap justify-between gap-3 rounded-xl border p-3"
              >
                <div>
                  <p className="text-xs font-semibold">{row.product}</p>
                  <p className="mt-1 text-[10px] text-muted">{row.code}</p>
                </div>
                <div className="text-right text-xs">
                  <p>
                    {currency(row.currentCost)} →{' '}
                    <strong>
                      {currency(row.simulatedCost)} / {row.unit}
                    </strong>
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    Impacto no lote: {currency(row.deltaTotal)} · Margem: {row.margin ?? '—'}%
                  </p>
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-muted">Sem produção neste mês para o produto selecionado.</p>
          )}
        </div>
      )}
    </section>
  );
}
