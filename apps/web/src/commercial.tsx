import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle,
  Send,
  ShoppingBag,
  Plus,
  Pause,
  Play,
  RefreshCw,
  PenLine,
  CalendarDays,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from './lib/api';
import { useAuth } from './lib/auth';
import { currency, date, number, statusLabels } from './lib/utils';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Loading, ErrorState } from './components/feedback';
interface Customer {
  id: string;
  name: string;
  phone: string;
  status: string;
}
interface Product {
  id: string;
  name: string;
  unit: string;
}
interface Lookups {
  customers: Customer[];
  products: Product[];
}
function useWrite() {
  const client = useQueryClient();
  const key = useRef({ request: '', key: '' });
  return useMutation({
    mutationFn: async (input: { path: string; method?: string; body: unknown }) => {
      const request = JSON.stringify(input);
      if (key.current.request !== request) key.current = { request, key: crypto.randomUUID() };
      return api<Record<string, unknown>>(input.path, {
        method: input.method ?? 'POST',
        body: JSON.stringify(input.body),
        headers: { 'Idempotency-Key': key.current.key },
      });
    },
    onSuccess: () => {
      key.current = { request: '', key: '' };
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
interface Template {
  id: string;
  name: string;
  content: string;
}
interface Messages {
  mode: string;
  rows: {
    id: string;
    content: string;
    direction: string;
    createdAt: string;
    customer: { name: string };
  }[];
  templates: Template[];
}
interface Proposal {
  items: { productId: string; name: string; quantity: number; unit: string; unitPrice: number }[];
  warnings: string[];
}
export function WhatsAppPage() {
  const { user } = useAuth();
  const lookups = useQuery({
    queryKey: ['lookups', user!.id],
    queryFn: () => api<Lookups>('/ops/lookups'),
  });
  const [customerId, setCustomerId] = useState('');
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [outgoing, setOutgoing] = useState('');
  const [prepared, setPrepared] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [template, setTemplate] = useState<Template | null>(null);
  const write = useWrite();
  const messages = useQuery({
    queryKey: ['whatsapp', customerId],
    queryFn: () =>
      api<Messages>(
        `/whatsapp${customerId ? `?customerId=${encodeURIComponent(customerId)}` : ''}`,
      ),
  });
  const receive = async () => {
    if (!customerId || !text.trim()) {
      toast.error('Selecione um cliente e informe a mensagem.');
      return;
    }
    const result = await write.mutateAsync({
      path: '/whatsapp/messages',
      body: { customerId, content: text },
    });
    setProposal(result.proposal as Proposal);
    setText('');
    setOrderCode('');
  };
  const confirm = async () => {
    if (!proposal || !customerId) return;
    const result = await write.mutateAsync({
      path: '/orders',
      body: {
        customerId,
        deliveryDate: new Date(Date.now() + 3600000).toISOString(),
        status: 'CONFIRMED',
        paymentMethod: 'PIX',
        items: proposal.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      },
    });
    setOrderCode(String(result.code));
    setProposal(null);
    toast.success('Pedido criado e estoque reservado.');
  };
  const prepare = async () => {
    if (!customerId || !outgoing.trim()) {
      toast.error('Escolha um cliente e revise o texto.');
      return;
    }
    const result = await write.mutateAsync({
      path: '/whatsapp/prepare',
      body: { customerId, content: outgoing },
    });
    setPrepared(String(result.whatsappUrl));
    toast.success('Mensagem preparada; revise antes de enviar no WhatsApp.');
  };
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">CONVERSAS QUE VIRAM PEDIDOS</p>
        <h1 className="page-title mt-2">Central WhatsApp</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Modo demonstração: mensagens ficam registradas no sistema. O envio real é feito por você
          ao abrir o WhatsApp.
        </p>
      </div>
      <div className="card p-5">
        <label htmlFor="chat-customer">Cliente da conversa</label>
        <select
          id="chat-customer"
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setProposal(null);
            setPrepared('');
            setOrderCode('');
          }}
        >
          <option value="">Todas as conversas · selecione para registrar uma mensagem</option>
          {lookups.data?.customers
            .filter((c) => c.status === 'ACTIVE')
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-5">
          <h2 className="section-title flex items-center gap-2">
            <MessageCircle size={17} />
            Histórico de mensagens
          </h2>
          {messages.isPending ? (
            <Loading />
          ) : messages.error ? (
            <ErrorState
              message={messages.error.message}
              retry={() => {
                void messages.refetch();
              }}
            />
          ) : (
            <div className="my-5 max-h-96 space-y-4 overflow-auto">
              {[...messages.data.rows].reverse().map((m) => (
                <article
                  key={m.id}
                  className={`max-w-[94%] rounded-2xl border p-4 ${m.direction.startsWith('PREPARED') ? 'ml-auto bg-primary/5' : 'bg-cream dark:bg-slate-800'}`}
                >
                  <p className="text-[10px] font-semibold text-primary dark:text-green-300">
                    {m.customer.name} ·{' '}
                    {m.direction.startsWith('PREPARED')
                      ? 'Preparada para envio'
                      : m.direction === 'INBOUND_OFFICIAL'
                        ? 'Recebida pelo webhook'
                        : 'Recebida em demonstração'}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                    {m.content}
                  </p>
                  <p className="mt-2 text-[10px] text-muted">{date(m.createdAt)}</p>
                </article>
              ))}
              {!messages.data.rows.length && (
                <p className="py-10 text-center text-sm text-muted">
                  Nenhuma mensagem deste cliente.
                </p>
              )}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void receive().catch(() => {});
            }}
            className="border-t pt-4"
          >
            <label htmlFor="incoming-message">Mensagem recebida / colada</label>
            <textarea
              id="incoming-message"
              required
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: 10 kg de minas frescal e 5 requeijão"
              rows={3}
              className="w-full rounded-xl border bg-transparent p-3 text-sm focus:outline-primary"
            />
            <Button className="mt-3" disabled={write.isPending || !customerId} type="submit">
              <ShoppingBag size={15} />
              Registrar e sugerir pedido
            </Button>
          </form>
        </section>
        <div className="space-y-5">
          {proposal && (
            <section className="card p-5">
              <h2 className="section-title">Pedido sugerido</h2>
              <p className="mt-2 text-xs leading-6 text-muted">
                Confira as quantidades e os preços do cadastro antes de confirmar. A disponibilidade
                será verificada pelo servidor.
              </p>
              <div className="mt-4 space-y-3">
                {proposal.items.map((i, n) => (
                  <div
                    key={n}
                    className="flex items-center justify-between gap-3 border-b pb-3 text-xs"
                  >
                    <span>
                      {number(i.quantity)} {i.unit} · {i.name}
                    </span>
                    <strong>{currency(i.quantity * i.unitPrice)}</strong>
                  </div>
                ))}
              </div>
              {proposal.warnings.map((w, i) => (
                <p key={i} className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                  {w}
                </p>
              ))}
              <Button
                className="mt-4"
                disabled={write.isPending || !proposal.items.length || proposal.warnings.length > 0}
                onClick={() => {
                  void confirm().catch(() => {});
                }}
              >
                Confirmar pedido sugerido
              </Button>
            </section>
          )}
          {orderCode && (
            <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Pedido {orderCode} confirmado.</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to={`/orders?search=${encodeURIComponent(orderCode)}`}>
                  Acompanhar pedido
                </Link>
              </Button>
            </section>
          )}
          <section className="card p-5">
            <h2 className="section-title">Preparar mensagem</h2>
            <label htmlFor="message-template" className="mt-4">
              Modelo de mensagem
            </label>
            <select
              id="message-template"
              defaultValue=""
              onChange={(e) => {
                const template = messages.data?.templates.find((t) => t.id === e.target.value);
                const customer = lookups.data?.customers.find((c) => c.id === customerId);
                if (template)
                  setOutgoing(
                    template.content
                      .replaceAll('{cliente}', customer?.name ?? '{cliente}')
                      .replaceAll(
                        '{data}',
                        new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                      ),
                  );
                setPrepared('');
              }}
            >
              <option value="">Escolha um modelo ou escreva abaixo</option>
              {messages.data?.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <label htmlFor="outgoing-message" className="mt-4">
              Texto para o cliente
            </label>
            <textarea
              id="outgoing-message"
              maxLength={4000}
              value={outgoing}
              onChange={(e) => {
                setOutgoing(e.target.value);
                setPrepared('');
              }}
              rows={4}
              className="w-full rounded-xl border bg-transparent p-3 text-sm focus:outline-primary"
            />
            <p className="mt-2 text-[10px] leading-5 text-muted">
              Substitua as variáveis restantes pelo conteúdo desejado. Preparar não confirma envio
              nem entrega.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={write.isPending || !customerId || !outgoing.trim()}
              onClick={() => {
                void prepare().catch(() => {});
              }}
            >
              <Send size={15} />
              Preparar envio
            </Button>
            {prepared && (
              <Button asChild className="mt-3 w-full">
                <a href={prepared} target="_blank" rel="noreferrer">
                  Abrir no WhatsApp
                </a>
              </Button>
            )}
          </section>
        </div>
      </div>
      <section className="card p-5">
        <h2 className="section-title">Modelos editáveis</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {messages.data?.templates.map((t) => (
            <button
              key={t.id}
              className="rounded-xl border p-4 text-left hover:border-primary"
              onClick={() => setTemplate({ ...t })}
            >
              <p className="flex items-center justify-between text-sm font-semibold">
                {t.name}
                <PenLine size={14} />
              </p>
              <p className="mt-2 text-xs leading-6 text-muted">{t.content}</p>
            </button>
          ))}
        </div>
      </section>
      <Dialog
        open={!!template}
        onOpenChange={(open) => {
          if (!open) setTemplate(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="font-heading text-xl font-bold">Editar modelo</DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-6 text-muted">
            Variáveis disponíveis: cliente, itens, total, data e lote, entre chaves.
          </DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (template)
                void write
                  .mutateAsync({
                    path: `/whatsapp/templates/${template.id}`,
                    method: 'PUT',
                    body: { name: template.name, content: template.content },
                  })
                  .then(() => {
                    toast.success('Modelo atualizado.');
                    setTemplate(null);
                  })
                  .catch(() => {});
            }}
          >
            <div>
              <label htmlFor="template-name">Nome do modelo</label>
              <input
                id="template-name"
                required
                value={template?.name ?? ''}
                onChange={(e) => setTemplate((t) => (t ? { ...t, name: e.target.value } : null))}
              />
            </div>
            <div>
              <label htmlFor="template-content">Mensagem do modelo</label>
              <textarea
                id="template-content"
                required
                rows={5}
                value={template?.content ?? ''}
                onChange={(e) => setTemplate((t) => (t ? { ...t, content: e.target.value } : null))}
                className="w-full rounded-xl border bg-transparent p-3 text-sm"
              />
            </div>
            <Button type="submit" disabled={write.isPending}>
              Salvar modelo
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
interface Plan {
  id: string;
  customerId: string;
  customer: { name: string };
  weekdays: number[];
  paused: boolean;
  paymentMethod: string;
  items: { productId: string; quantity: string; product: { name: string; unit: string } }[];
  exceptions: { date: string; skip: boolean }[];
  orders?: { id: string; code: string; status: string; deliveryDate: string }[];
}
const days = [
  [1, 'Seg'],
  [2, 'Ter'],
  [3, 'Qua'],
  [4, 'Qui'],
  [5, 'Sex'],
  [6, 'Sáb'],
  [0, 'Dom'],
] as const;
export function RecurringPage() {
  const { user } = useAuth();
  const data = useQuery({
    queryKey: ['recurring'],
    queryFn: () => api<{ rows: Plan[] }>('/recurring'),
  });
  const lookups = useQuery({
    queryKey: ['lookups', user!.id],
    queryFn: () => api<Lookups>('/ops/lookups'),
  });
  const write = useWrite();
  const [editing, setEditing] = useState<Plan | true | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1, 4]);
  const [method, setMethod] = useState('PIX');
  const [items, setItems] = useState<{ productId: string; quantity: string }[]>([
    { productId: '', quantity: '1' },
  ]);
  const [skip, setSkip] = useState<Plan | null>(null);
  const [skipDate, setSkipDate] = useState('');
  const open = (plan?: Plan) => {
    setEditing(plan ?? true);
    setCustomerId(plan?.customerId ?? '');
    setWeekdays(plan?.weekdays ?? [1, 4]);
    setMethod(plan?.paymentMethod ?? 'PIX');
    setItems(
      plan?.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) ?? [
        { productId: '', quantity: '1' },
      ],
    );
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">ROTINA QUE FACILITA</p>
          <h1 className="page-title mt-2">Pedidos fixos</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Geração diária às 5h, no horário de Brasília, para os próximos sete dias. Os pedidos
            nascem novos; confirmar reserva o estoque e verifica o crédito.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={write.isPending}
            onClick={() => {
              void write
                .mutateAsync({ path: '/recurring/generate', body: {} })
                .then((r) => toast.success(`${r.created} pedidos novos gerados.`))
                .catch(() => {});
            }}
          >
            <RefreshCw size={15} />
            Gerar próximos 7 dias
          </Button>
          <Button onClick={() => open()}>
            <Plus size={15} />
            Novo pedido fixo
          </Button>
        </div>
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
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          {data.data.rows.map((plan) => (
            <article
              key={plan.id}
              data-testid={`recurring-${plan.id}`}
              className="card min-w-0 p-5"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-base font-bold">{plan.customer.name}</h2>
                  <p className="mt-2 text-xs text-muted">
                    {plan.weekdays.map((day) => days.find((d) => d[0] === day)?.[1]).join(' · ')} ·{' '}
                    {plan.paused ? 'Pausado' : 'Ativo'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar pedido fixo de ${plan.customer.name}`}
                  onClick={() => open(plan)}
                >
                  <PenLine size={16} />
                </Button>
              </div>
              <div className="mt-5 space-y-2">
                {plan.items.map((item, i) => (
                  <p key={i} className="text-xs">
                    <strong>
                      {number(Number(item.quantity))} {item.product.unit}
                    </strong>{' '}
                    de {item.product.name}
                  </p>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={write.isPending}
                  onClick={() => {
                    void write
                      .mutateAsync({
                        path: `/recurring/${plan.id}/pause`,
                        method: 'PATCH',
                        body: { paused: !plan.paused },
                      })
                      .then(() =>
                        toast.success(
                          plan.paused
                            ? 'Plano retomado.'
                            : 'Plano pausado. Pedidos existentes foram preservados.',
                        ),
                      )
                      .catch(() => {});
                  }}
                >
                  {plan.paused ? <Play size={13} /> : <Pause size={13} />}{' '}
                  {plan.paused ? 'Retomar' : 'Pausar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSkip(plan);
                    setSkipDate('');
                  }}
                >
                  <CalendarDays size={13} />
                  Pular uma data
                </Button>
              </div>
              {plan.orders && plan.orders.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <p className="text-[10px] font-semibold text-muted">
                    OCORRÊNCIAS DA SEMANA · EDITE PELO PEDIDO
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {plan.orders.map((o) => (
                      <Link
                        key={o.id}
                        to={`/orders?search=${encodeURIComponent(o.code)}`}
                        className="rounded-lg bg-primary/5 px-2 py-1.5 text-[10px] font-semibold text-primary dark:text-green-300"
                      >
                        {date(o.deliveryDate)} · {statusLabels[o.status]}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {plan.exceptions.filter((e) => e.skip).length > 0 && (
                <p className="mt-4 text-[10px] text-muted">
                  Datas puladas:{' '}
                  {plan.exceptions
                    .filter((e) => e.skip)
                    .map((e) => date(e.date))
                    .join(', ')}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !write.isPending) setEditing(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogTitle className="font-heading text-xl font-bold">
            {editing === true ? 'Novo pedido fixo' : 'Editar pedido fixo'}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-6 text-muted">
            Alterações valem para novas ocorrências. Pedidos já gerados podem ser ajustados pelo
            módulo Pedidos.
          </DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const plan = editing && editing !== true ? editing : null;
              void write
                .mutateAsync({
                  path: `/recurring${plan ? `/${plan.id}` : ''}`,
                  method: plan ? 'PUT' : 'POST',
                  body: {
                    customerId,
                    weekdays,
                    paused: plan?.paused ?? false,
                    paymentMethod: method,
                    items: items.map((i) => ({
                      productId: i.productId,
                      quantity: Number(i.quantity),
                    })),
                  },
                })
                .then(() => {
                  toast.success('Pedido fixo salvo.');
                  setEditing(null);
                })
                .catch(() => {});
            }}
          >
            <div>
              <label htmlFor="plan-customer">Cliente do pedido fixo</label>
              <select
                id="plan-customer"
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {lookups.data?.customers
                  .filter((c) => c.status === 'ACTIVE')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <fieldset>
              <legend className="mb-3 text-xs font-semibold">Dias de entrega</legend>
              <div className="flex flex-wrap gap-2">
                {days.map(([day, label]) => (
                  <label
                    key={day}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs"
                  >
                    <input
                      className="h-4 w-4 accent-primary"
                      type="checkbox"
                      checked={weekdays.includes(day)}
                      onChange={(e) =>
                        setWeekdays((v) =>
                          e.target.checked ? [...v, day] : v.filter((d) => d !== day),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="plan-method">Forma de pagamento</label>
              <select id="plan-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {[
                  ['PIX', 'Pix'],
                  ['BOLETO', 'Boleto'],
                  ['CASH', 'Dinheiro'],
                  ['CARD', 'Cartão'],
                ].map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="space-y-4">
              <legend className="mb-3 text-xs font-semibold">Itens recorrentes</legend>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_32px] gap-2">
                  <div>
                    <label htmlFor={`plan-product-${i}`}>Produto</label>
                    <select
                      id={`plan-product-${i}`}
                      required
                      value={item.productId}
                      onChange={(e) =>
                        setItems((v) =>
                          v.map((l, n) => (n === i ? { ...l, productId: e.target.value } : l)),
                        )
                      }
                    >
                      <option value="">Selecione…</option>
                      {lookups.data?.products.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name} ({p.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`plan-quantity-${i}`}>Quantidade</label>
                    <input
                      id={`plan-quantity-${i}`}
                      required
                      type="number"
                      step=".001"
                      min=".001"
                      value={item.quantity}
                      onChange={(e) =>
                        setItems((v) =>
                          v.map((l, n) => (n === i ? { ...l, quantity: e.target.value } : l)),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="self-end"
                    aria-label={`Remover item recorrente ${i + 1}`}
                    disabled={items.length === 1}
                    onClick={() => setItems((v) => v.filter((_, n) => n !== i))}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((v) => [...v, { productId: '', quantity: '1' }])}
              >
                Adicionar produto
              </Button>
            </fieldset>
            <Button type="submit" disabled={write.isPending} className="w-full">
              Salvar pedido fixo
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!skip}
        onOpenChange={(open) => {
          if (!open) setSkip(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="font-heading text-xl font-bold">Pular uma ocorrência</DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-6 text-muted">
            A data será ignorada nas próximas gerações. Pedidos novos ou confirmados desta
            ocorrência serão cancelados e suas reservas liberadas.
          </DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (skip)
                void write
                  .mutateAsync({ path: `/recurring/${skip.id}/skip`, body: { date: skipDate } })
                  .then(() => {
                    toast.success('Ocorrência cancelada.');
                    setSkip(null);
                  })
                  .catch(() => {});
            }}
          >
            <label htmlFor="skip-date">Data a pular</label>
            <input
              id="skip-date"
              required
              type="date"
              value={skipDate}
              onChange={(e) => setSkipDate(e.target.value)}
            />
            <Button type="submit" disabled={write.isPending}>
              Confirmar data pulada
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
