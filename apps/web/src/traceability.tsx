import { useState, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Download,
  Leaf,
  Factory,
  UsersRound,
  ShieldAlert,
  ArrowRight,
  Milk,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from './lib/api';
import { date, number, statusLabels } from './lib/utils';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Loading, ErrorState } from './components/feedback';
import { Badge } from './components/badge';
import { Brand } from './components/brand';
interface Trace {
  code: string;
  id: string;
  product: string;
  unit: string;
  status: string;
  manufacturedAt: string;
  expiresAt: string;
  qrCode: string;
  publicPath: string;
  responsible: string;
  sources: {
    id: string;
    producer: string;
    farm: string;
    city: string;
    liters: string;
    approved: boolean;
  }[];
  supplies: { id: string; name: string; quantity: string; unit: string; lotCode: string }[];
  customers: { name: string; orderCode: string; quantity: string; deliveredAt: string }[];
  pendingOrders: { id: string; code: string; customer: string; status: string }[];
  timeline: { id: string; date: string; reason: string; quantity: string }[];
}
interface Recall extends Trace {
  affectedCustomers: { customerId: string; name: string; message: string; whatsappUrl: string }[];
}
export async function downloadFile(path: string, name: string) {
  let response = await fetch(`/api${path}`, { credentials: 'include' });
  if (response.status === 401) {
    await api('/auth/refresh', { method: 'POST' });
    response = await fetch(`/api${path}`, { credentials: 'include' });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'Não foi possível exportar o arquivo.');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
export default function Traceability() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const selected = params.toString();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const choices = useQuery({
    queryKey: ['trace-options'],
    queryFn: () =>
      api<{ producers: { id: string; name: string }[]; customers: { id: string; name: string }[] }>(
        '/traceability/options',
      ),
  });
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [recall, setRecall] = useState<Recall | null>(null);
  const key = useRef({ body: '', key: '' });
  const data = useQuery({
    queryKey: ['trace', selected],
    queryFn: () =>
      api<
        Trace | { rows: { id: string; code: string; status: string; product: { name: string } }[] }
      >(`/traceability${selected ? `?${selected}` : ''}`),
  });
  const current = data.data && 'code' in data.data ? data.data : null;
  const mutation = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 5)
        throw new Error('Informe um motivo com pelo menos cinco caracteres.');
      const body = JSON.stringify({ reason });
      if (key.current.body !== body) key.current = { body, key: crypto.randomUUID() };
      return api<Recall>(`/batches/${current!.id}/recall`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': key.current.key },
      });
    },
    onSuccess: (result) => {
      setRecall(result);
      setConfirm(false);
      toast.success('Lote bloqueado. Confira os clientes afetados.');
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const exportPdf = (label: boolean) => {
    if (!current) return;
    void downloadFile(
      `/batches/${current.id}/${label ? 'label' : 'trace'}.pdf`,
      `${label ? 'etiqueta' : 'rastreio'}-${current.code}.pdf`,
    ).catch((e: Error) => toast.error(e.message));
  };
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">CONFIANÇA EM CADA ORIGEM</p>
        <h1 className="page-title mt-2">Rastreabilidade</h1>
        <p className="mt-2 text-sm text-muted">
          Do produtor ao cliente, a história completa de cada lote.
        </p>
      </div>
      <form
        className="card flex flex-wrap gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setRecall(null);
          setParams({ ...filters, ...(code.trim() ? { code: code.trim().toUpperCase() } : {}) });
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="trace-code" className="sr-only">
            Código do lote
          </label>
          <input
            id="trace-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Informe o código exato do lote…"
          />
        </div>
        <Button type="submit">
          <Search size={16} />
          Rastrear lote
        </Button>
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['producerId', 'Produtor de origem', 'producers'],
            ['customerId', 'Cliente atendido', 'customers'],
          ].map(([key, label, collection]) => (
            <div key={key}>
              <label htmlFor={`trace-${key}`}>{label}</label>
              <select
                id={`trace-${key}`}
                value={filters[key] ?? ''}
                onChange={(e) =>
                  setFilters((v) => {
                    const next = { ...v };
                    if (e.target.value) next[key] = e.target.value;
                    else delete next[key];
                    return next;
                  })
                }
              >
                <option value="">Todos</option>
                {choices.data?.[collection as 'producers'].map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {[
            ['supplyLot', 'Lote de insumo', 'text'],
            ['from', 'Fabricação de', 'date'],
            ['to', 'Fabricação até', 'date'],
          ].map(([key, label, type]) => (
            <div key={key}>
              <label htmlFor={`trace-${key}`}>{label}</label>
              <input
                id={`trace-${key}`}
                type={type}
                value={filters[key] ?? ''}
                onChange={(e) =>
                  setFilters((v) => {
                    const next = { ...v };
                    if (e.target.value) next[key] = e.target.value;
                    else delete next[key];
                    return next;
                  })
                }
              />
            </div>
          ))}
        </div>
      </form>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState
          message={data.error.message}
          retry={() => {
            void data.refetch();
          }}
        />
      ) : current ? (
        <>
          <section className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <Badge value={current.status}>{statusLabels[current.status]}</Badge>
                <h2 className="mt-4 font-heading text-xl font-bold">{current.product}</h2>
                <p className="mt-2 text-sm font-semibold text-primary dark:text-green-300">
                  {current.code}
                </p>
                <p className="mt-3 text-xs text-muted">
                  Produzido em {date(current.manufacturedAt)} · Validade {date(current.expiresAt)}
                  <br />
                  Responsável: {current.responsible}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => exportPdf(true)}>
                    <Download size={14} />
                    Etiqueta com QR
                  </Button>
                  <Button variant="outline" onClick={() => exportPdf(false)}>
                    <Download size={14} />
                    Relatório PDF
                  </Button>
                  <Button variant="outline" onClick={() => setConfirm(true)}>
                    <ShieldAlert size={14} />
                    Simular recall
                  </Button>
                </div>
              </div>
              <div className="text-center">
                <img
                  alt={`QR Code de rastreabilidade do lote ${current.code}`}
                  src={current.qrCode}
                  className="h-32 w-32 rounded-xl border bg-white p-2"
                />
                <Link
                  className="mt-2 block text-xs font-semibold text-primary dark:text-green-300"
                  to={current.publicPath}
                  target="_blank"
                >
                  Página do consumidor ↗
                </Link>
              </div>
            </div>
          </section>
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="card p-5">
              <h2 className="section-title flex items-center gap-2">
                <Milk size={18} className="text-primary" />
                Origem do leite
              </h2>
              <div className="mt-5 space-y-4">
                {current.sources.map((s) => (
                  <article key={s.id} className="rounded-xl border p-3">
                    <p className="text-xs font-semibold">{s.producer}</p>
                    <p className="mt-2 text-[11px] text-muted">
                      {s.farm} · {s.city}
                    </p>
                    <p className="mt-2 text-sm font-bold">{number(Number(s.liters))} L</p>
                    <p className="mt-1 text-[10px] text-primary dark:text-green-300">
                      {s.approved ? 'Leite aprovado' : 'Leite reprovado'}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="section-title flex items-center gap-2">
                <Factory size={18} className="text-primary" />
                Insumos do lote
              </h2>
              <div className="mt-5 space-y-4">
                {current.supplies.map((s) => (
                  <article key={s.id} className="rounded-xl border p-3">
                    <p className="text-xs font-semibold">{s.name}</p>
                    <p className="mt-2 text-[11px] text-muted">Lote {s.lotCode}</p>
                    <p className="mt-2 text-sm font-bold">
                      {number(Number(s.quantity), 5)} {s.unit}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="section-title flex items-center gap-2">
                <UsersRound size={18} className="text-primary" />
                Clientes atendidos
              </h2>
              <div className="mt-5 space-y-4">
                {current.customers.length ? (
                  current.customers.map((c, i) => (
                    <article key={i} className="rounded-xl border p-3">
                      <p className="text-xs font-semibold">{c.name}</p>
                      <p className="mt-2 text-[11px] text-muted">
                        {c.orderCode} · {date(c.deliveredAt)}
                      </p>
                      <p className="mt-2 text-sm font-bold">
                        {number(Number(c.quantity))} {current.unit}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="text-xs leading-6 text-muted">
                    Este lote ainda não possui entregas concluídas.
                  </p>
                )}
              </div>
              {current.pendingOrders.length > 0 && (
                <div className="mt-5 border-t pt-4">
                  <h3 className="text-xs font-semibold">Pedidos com reserva</h3>
                  {current.pendingOrders.map((o) => (
                    <p key={o.id} className="mt-3 text-[11px] text-muted">
                      {o.code} · {o.customer} · {statusLabels[o.status]}
                    </p>
                  ))}
                </div>
              )}
            </section>
          </div>
          <section className="card p-5">
            <h2 className="section-title">Linha do tempo</h2>
            <div className="mt-4 space-y-4">
              {current.timeline.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 border-l-2 border-primary/20 pl-4"
                >
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold">{event.reason}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {date(event.date)} · {number(Number(event.quantity), 3)} {current.unit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {recall && (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/30">
              <h2 className="font-heading font-bold">Lote bloqueado · comunicação de recall</h2>
              <p className="mt-2 text-xs leading-6 text-muted">
                O envio não é automático. Revise cada aviso antes de abrir o WhatsApp.
              </p>
              <div className="mt-4 space-y-4">
                {recall.affectedCustomers.length ? (
                  recall.affectedCustomers.map((c) => (
                    <article
                      key={c.customerId}
                      className="rounded-xl bg-white p-4 dark:bg-slate-900"
                    >
                      <p className="text-sm font-semibold">{c.name}</p>
                      <p className="mt-2 text-xs leading-6 text-muted">{c.message}</p>
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <a href={c.whatsappUrl} target="_blank" rel="noreferrer">
                          Abrir aviso no WhatsApp
                          <ArrowRight size={13} />
                        </a>
                      </Button>
                    </article>
                  ))
                ) : (
                  <p className="text-sm">Nenhum cliente recebeu este lote até o momento.</p>
                )}
              </div>
            </section>
          )}
        </>
      ) : data.data && 'rows' in data.data ? (
        <section className="card p-5">
          <h2 className="section-title">Lotes encontrados (até 100)</h2>
          {!data.data.rows.length && (
            <p className="mt-4 text-sm text-muted">
              Nenhum lote corresponde aos filtros informados.
            </p>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.data.rows.map((b) => (
              <button
                key={b.id}
                className="rounded-xl border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
                onClick={() => {
                  setCode(b.code);
                  setParams({ code: b.code });
                }}
              >
                <p className="text-xs font-semibold">{b.product.name}</p>
                <p className="mt-2 text-[11px] text-muted">{b.code}</p>
                <span className="mt-3 block">
                  <Badge value={b.status}>{statusLabels[b.status]}</Badge>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle className="font-heading text-xl font-bold">
            Simular recall do lote
          </DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-muted">
            Esta ação bloqueia o lote de verdade, impede novas vendas/entregas e identifica os
            clientes que já o receberam. Nenhuma mensagem será enviada automaticamente.
          </DialogDescription>
          <label htmlFor="recall-reason" className="mt-5">
            Motivo do recall
          </label>
          <input
            id="recall-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={5}
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              Confirmar bloqueio e listar clientes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
interface PublicTrace {
  code: string;
  product: string;
  status: string;
  manufacturedAt: string;
  expiresAt: string;
  company: { name: string; city: string };
  sources: { farm: string; city: string; approved: boolean }[];
}
export function PublicTraceability() {
  const { code } = useParams();
  const data = useQuery({
    queryKey: ['public-trace', code],
    queryFn: () => api<PublicTrace>(`/public/trace/${encodeURIComponent(code ?? '')}`),
  });
  return (
    <main id="main" className="mx-auto min-h-dvh max-w-2xl px-5 py-10">
      <Brand />
      <p className="eyebrow mt-12">A ORIGEM FAZ PARTE DO SABOR</p>
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
          <h1 className="page-title mt-4">{data.data.product}</h1>
          <p className="mt-3 text-sm text-muted">
            Lote {data.data.code} · {data.data.company.name}
          </p>
          <section className="card mt-6 p-6">
            <Badge value={data.data.status}>{statusLabels[data.data.status]}</Badge>
            {['BLOCKED', 'EXPIRED'].includes(data.data.status) && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 dark:bg-red-950 dark:text-red-200"
              >
                Não consuma este produto. Entre em contato com o estabelecimento onde comprou.
              </p>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Fabricação</dt>
                <dd className="mt-2 font-semibold">{date(data.data.manufacturedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Validade</dt>
                <dd className="mt-2 font-semibold">{date(data.data.expiresAt)}</dd>
              </div>
            </dl>
          </section>
          <h2 className="mt-8 font-heading text-lg font-bold">Cuidado que começa no campo.</h2>
          <div className="mt-4 space-y-3">
            {[...new Map(data.data.sources.map((s) => [`${s.farm}-${s.city}`, s])).values()].map(
              (s) => (
                <article key={`${s.farm}-${s.city}`} className="card flex items-center gap-4 p-5">
                  <Leaf className="text-primary" />
                  <div>
                    <p className="font-semibold">{s.farm}</p>
                    <p className="mt-2 text-xs text-muted">
                      {s.city} / MG · Leite {s.approved ? 'aprovado' : 'em análise'}
                    </p>
                  </div>
                </article>
              ),
            )}
          </div>
          <p className="mt-8 text-center text-xs text-muted">
            Informações registradas por {data.data.company.name}, {data.data.company.city}.
          </p>
        </>
      )}
    </main>
  );
}
