import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowDownUp,
  Plus,
  Loader2,
  MapPin,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, type PageData } from './lib/api';
import { useAuth } from './lib/auth';
import { currency, number, date, roleLabels, statusLabels } from './lib/utils';
import { navigation } from './navigation';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Badge } from './components/badge';
import {
  OperationalTools,
  RecordActions,
  OperationalDialog,
  type OperationSelection,
} from './components/operations';
import { FinancialOverview } from './finance-overview';
import { Loading, ErrorState, EmptyState } from './components/feedback';
type Column = {
  key: string;
  label: string;
  format?: 'money' | 'number' | 'date' | 'status' | 'active' | 'role' | 'approved';
};
const columns: Record<string, Column[]> = {
  producers: [
    { key: 'name', label: 'Produtor' },
    { key: 'farm', label: 'Propriedade' },
    { key: 'city', label: 'Município' },
    { key: 'pricePerLiter', label: 'Preço / L', format: 'money' },
    { key: 'active', label: 'Situação', format: 'active' },
  ],
  receipts: [
    { key: 'date', label: 'Recebimento', format: 'date' },
    { key: 'producer', label: 'Produtor' },
    { key: 'liters', label: 'Volume (L)', format: 'number' },
    { key: 'temperature', label: 'Temperatura (°C)', format: 'number' },
    { key: 'acidity', label: 'Acidez (°D)', format: 'number' },
    { key: 'approved', label: 'Qualidade', format: 'approved' },
  ],
  products: [
    { key: 'code', label: 'Código' },
    { key: 'name', label: 'Produto' },
    { key: 'category', label: 'Categoria' },
    { key: 'unit', label: 'Unidade' },
    { key: 'salePrice', label: 'Preço de venda', format: 'money' },
    { key: 'expectedLitersPerUnit', label: 'Leite / unidade (L)', format: 'number' },
    { key: 'shelfLifeDays', label: 'Validade (dias)', format: 'number' },
  ],
  batches: [
    { key: 'code', label: 'Lote' },
    { key: 'product', label: 'Produto' },
    { key: 'expiresAt', label: 'Validade', format: 'date' },
    { key: 'quantity', label: 'Saldo físico', format: 'number' },
    { key: 'reserved', label: 'Reservado', format: 'number' },
    { key: 'unit', label: 'Unidade' },
    { key: 'status', label: 'Situação', format: 'status' },
  ],
  supplies: [
    { key: 'name', label: 'Insumo' },
    { key: 'unit', label: 'Unidade' },
    { key: 'stock', label: 'Estoque', format: 'number' },
    { key: 'minimumStock', label: 'Mínimo', format: 'number' },
    { key: 'unitCost', label: 'Custo unitário', format: 'money' },
  ],
  customers: [
    { key: 'name', label: 'Cliente' },
    { key: 'type', label: 'Segmento', format: 'status' },
    { key: 'city', label: 'Município' },
    { key: 'contact', label: 'Contato' },
    { key: 'phone', label: 'Telefone' },
    { key: 'status', label: 'Situação', format: 'status' },
  ],
  orders: [
    { key: 'code', label: 'Pedido' },
    { key: 'customer', label: 'Cliente' },
    { key: 'deliveryDate', label: 'Entrega', format: 'date' },
    { key: 'status', label: 'Situação', format: 'status' },
    { key: 'total', label: 'Total', format: 'money' },
  ],
  deliveries: [
    { key: 'code', label: 'Pedido' },
    { key: 'customer', label: 'Cliente' },
    { key: 'city', label: 'Cidade' },
    { key: 'route', label: 'Rota' },
    { key: 'driver', label: 'Entregador' },
    { key: 'date', label: 'Data', format: 'date' },
    { key: 'status', label: 'Situação', format: 'status' },
  ],
  finance: [
    { key: 'code', label: 'Pedido' },
    { key: 'customer', label: 'Cliente' },
    { key: 'dueDate', label: 'Vencimento', format: 'date' },
    { key: 'amount', label: 'Valor', format: 'money' },
    { key: 'paidAmount', label: 'Recebido', format: 'money' },
    { key: 'balance', label: 'Em aberto', format: 'money' },
  ],
  announcements: [
    { key: 'title', label: 'Aviso' },
    { key: 'content', label: 'Mensagem' },
    { key: 'author', label: 'Responsável' },
    { key: 'createdAt', label: 'Publicado em', format: 'date' },
  ],
  users: [
    { key: 'name', label: 'Nome' },
    { key: 'email', label: 'E-mail' },
    { key: 'role', label: 'Papel', format: 'role' },
    { key: 'active', label: 'Situação', format: 'active' },
  ],
};
const descriptions: Record<string, string> = {
  producers: 'Quem cuida da origem de cada litro.',
  receipts: 'Volumes e qualidade do leite recebido.',
  products: 'Produtos, preços e rendimentos cadastrados.',
  batches: 'Acompanhe a produção e a disponibilidade dos lotes.',
  supplies: 'Insumos e embalagens que dão vida à produção.',
  customers: 'Os parceiros que levam seu produto mais longe.',
  orders: 'Uma visão dos pedidos e de cada compromisso.',
  deliveries: 'Planejamento e acompanhamento das entregas.',
  finance: 'Valores gerados pelos pedidos entregues.',
  announcements: 'Informação que aproxima sua equipe.',
  users: 'Pessoas certas, com os acessos certos.',
};
function text(value: unknown, column: Column) {
  if (value === null || value === undefined) return '—';
  if (column.format === 'money') return currency(Number(value));
  if (column.format === 'number') return number(Number(value), 3);
  if (column.format === 'date') return date(String(value));
  if (column.format === 'active') return value ? 'Ativo' : 'Inativo';
  if (column.format === 'approved') return value ? 'Aprovado' : 'Reprovado';
  if (column.format === 'role') return roleLabels[String(value)] ?? String(value);
  if (column.format === 'status') return statusLabels[String(value)] ?? String(value);
  return String(value);
}
function Value({ row, column }: { row: Record<string, unknown>; column: Column }) {
  const value = row[column.key];
  const label = text(value, column);
  return ['status', 'active', 'approved'].includes(column.format ?? '') ? (
    <Badge value={String(value)}>{label}</Badge>
  ) : (
    <span className={column.format === 'money' || column.format === 'number' ? 'tabular-nums' : ''}>
      {label}
    </span>
  );
}
const userSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome completo.').max(100),
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(10, 'Use pelo menos 10 caracteres.').max(72),
  role: z.enum(['OWNER', 'PRODUCTION', 'SALES', 'DRIVER']),
});
function CreateUser({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const client = useQueryClient();
  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    mode: 'onChange',
    defaultValues: { name: '', email: '', password: '', role: 'PRODUCTION' },
  });
  const create = useMutation({
    mutationFn: (values: z.infer<typeof userSchema>) =>
      api('/users', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      toast.success('Usuário criado com sucesso.');
      void client.invalidateQueries({ queryKey: ['directory', 'users'] });
      form.reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!create.isPending) onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogTitle className="font-heading text-xl font-bold">Adicionar à equipe</DialogTitle>
        <DialogDescription className="mb-6 mt-2 text-xs leading-6 text-muted">
          Defina o papel e o acesso desta pessoa. O novo usuário poderá entrar com o e-mail e a
          senha cadastrados.
        </DialogDescription>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          {[
            ['name', 'Nome completo'],
            ['email', 'E-mail'],
            ['password', 'Senha inicial'],
          ].map(([key, label]) => {
            const field = key as 'name' | 'email' | 'password';
            return (
              <div key={key}>
                <label htmlFor={`new-${key}`}>{label}</label>
                <input
                  id={`new-${key}`}
                  type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'}
                  autoComplete={key === 'password' ? 'new-password' : 'off'}
                  {...form.register(field)}
                  aria-invalid={!!form.formState.errors[field]}
                  aria-describedby={`new-${key}-error`}
                />
                <p id={`new-${key}-error`} className="field-error">
                  {form.formState.errors[field]?.message}
                </p>
              </div>
            );
          })}
          <div>
            <label htmlFor="new-role">Papel na equipe</label>
            <select id="new-role" {...form.register('role')}>
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              Criar usuário
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export default function Directory({ resource }: { resource: string }) {
  const [operation, setOperation] = useState<OperationSelection | null>(null);
  const { user } = useAuth();
  const [params] = useSearchParams();
  const initial = params.get('search') ?? '';
  const [search, setSearch] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('asc');
  const [exporting, setExporting] = useState(false);
  const [create, setCreate] = useState(false);
  useEffect(() => {
    setSearch(initial);
    setPage(1);
  }, [initial]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const data = useQuery({
    queryKey: ['directory', resource, user!.id, debounced, page, sort],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<PageData>(
        `/${resource}?${new URLSearchParams({ page: String(page), limit: '12', search: debounced, sort })}`,
      ),
  });
  const entry = navigation.find((n) => n.key === resource)!;
  const cols = columns[resource];
  const driver = resource === 'deliveries' && user!.role === 'DRIVER';
  async function exportCsv() {
    setExporting(true);
    try {
      const rows: Record<string, unknown>[] = [];
      for (let p = 1; ; p++) {
        const result = await api<PageData>(
          `/${resource}?${new URLSearchParams({ page: String(p), limit: '100', search: debounced, sort })}`,
        );
        rows.push(...result.rows);
        if (rows.length >= result.total || !result.rows.length) break;
      }
      const escape = (s: string) =>
        `"${(/^(?:\s*[=+@-]|[\t\r\n])/.test(s) ? "'" : '') + s.replaceAll('"', '""')}"`;
      const csv =
        '\ufeff' +
        [
          cols.map((c) => escape(c.label)).join(';'),
          ...rows.map((r) => cols.map((c) => escape(text(r[c.key], c))).join(';')),
        ].join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `agro-certa-${resource}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} registros exportados.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha na exportação.');
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">
            {entry.group} · {driver ? 'SUAS ENTREGAS DE HOJE' : 'GESTÃO OPERACIONAL'}
          </p>
          <h1 className="page-title mt-2">{driver ? 'Seu dia na estrada' : entry.label}</h1>
          <p className="mt-2 text-xs leading-6 text-muted">
            {driver
              ? 'Seus pedidos de hoje, com os endereços para chegar até o cliente.'
              : descriptions[resource]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OperationalTools resource={resource} />
          <Button
            variant="outline"
            disabled={exporting || data.isPending || !!data.error}
            onClick={() => {
              void exportCsv();
            }}
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Exportar CSV
          </Button>
          {resource === 'users' && (
            <Button onClick={() => setCreate(true)}>
              <Plus size={16} />
              Novo usuário
            </Button>
          )}
        </div>
      </div>
      {resource === 'finance' && <FinancialOverview />}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4 dark:border-slate-800 sm:p-5">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-3 text-muted" size={16} />
            <input
              className="h-10 pl-10 text-xs"
              placeholder={
                resource === 'batches'
                  ? 'Buscar por lote ou produto…'
                  : resource === 'orders'
                    ? 'Buscar por pedido ou cliente…'
                    : 'Buscar registros…'
              }
              aria-label="Buscar registros"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSort((s) => (s === 'asc' ? 'desc' : 'asc'));
              setPage(1);
            }}
            aria-label="Alternar ordenação"
          >
            <ArrowDownUp size={14} />
            {['receipts', 'batches', 'orders', 'deliveries', 'finance'].includes(resource)
              ? sort === 'asc'
                ? 'Mais recentes'
                : 'Mais antigos'
              : sort === 'asc'
                ? 'A → Z'
                : 'Z → A'}
          </Button>
        </div>
        {data.isPending ? (
          <div className="p-6">
            <Loading />
          </div>
        ) : data.error ? (
          <div className="p-5">
            <ErrorState
              message={data.error.message}
              retry={() => {
                void data.refetch();
              }}
            />
          </div>
        ) : data.data.rows.length === 0 ? (
          <EmptyState
            title={driver ? 'Nenhuma entrega agendada para hoje' : 'Nenhum registro encontrado'}
            description={
              driver
                ? 'Você está em dia. Novas entregas aparecerão quando forem atribuídas a você.'
                : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">
                  {entry.label} — página {page}
                </caption>
                <thead>
                  <tr className="bg-stone-50/70 dark:bg-slate-800/40">
                    {cols.map((c) => (
                      <th
                        scope="col"
                        key={c.key}
                        className="whitespace-nowrap px-5 py-3.5 text-[10px] font-semibold text-muted"
                      >
                        {c.label}
                      </th>
                    ))}
                    {resource !== 'users' && (
                      <th scope="col" className="px-5 py-3 text-[10px] text-muted">
                        Operações
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
                  {data.data.rows.map((row) => (
                    <tr
                      key={String(row.id)}
                      className="transition-colors hover:bg-cream/60 dark:hover:bg-slate-800/40"
                    >
                      {cols.map((c, i) => (
                        <td
                          key={c.key}
                          className={`px-5 py-4 leading-6 ${i === 0 ? 'font-semibold' : 'text-stone-600 dark:text-slate-300'} ${c.key === 'content' ? 'min-w-[300px]' : 'whitespace-nowrap'}`}
                        >
                          <Value row={row} column={c} />
                        </td>
                      ))}
                      {resource !== 'users' && (
                        <td className="min-w-[220px] px-5 py-3">
                          <RecordActions resource={resource} row={row} onSelect={setOperation} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {data.data.rows.map((row) => (
                <article
                  key={String(row.id)}
                  className="rounded-xl border border-stone-200 p-4 dark:border-slate-700"
                >
                  {driver && (
                    <div className="mb-3 flex items-center gap-2 text-primary dark:text-green-300">
                      <Truck size={18} />
                      <strong className="text-sm">{String(row.customer)}</strong>
                    </div>
                  )}
                  <dl className="space-y-3">
                    {cols.map((c, i) => (
                      <div key={c.key} className="flex items-start justify-between gap-4 text-xs">
                        <dt className="max-w-[42%] shrink-0 text-muted">{c.label}</dt>
                        <dd
                          className={`min-w-0 break-words text-right ${i === 0 ? 'font-semibold' : ''}`}
                        >
                          <Value row={row} column={c} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 border-t pt-3">
                    <RecordActions resource={resource} row={row} onSelect={setOperation} />
                  </div>
                  {driver && (
                    <Button asChild variant="outline" className="mt-4 w-full">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.address}, ${row.city}, MG`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MapPin size={15} />
                        Abrir navegação
                      </a>
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
        {data.data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-5 py-4 dark:border-slate-800">
            <p className="text-[11px] text-muted">
              {data.data.total
                ? `${(page - 1) * 12 + 1}–${Math.min(page * 12, data.data.total)} de ${number(data.data.total, 0)} registros`
                : '0 registros'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Página anterior"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={15} />
              </Button>
              <span className="px-2 text-xs">
                {page} / {Math.max(1, Math.ceil(data.data.total / 12))}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Próxima página"
                disabled={page * 12 >= data.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}
      </section>
      {operation && <OperationalDialog selection={operation} onClose={() => setOperation(null)} />}
      {resource === 'users' && <CreateUser open={create} onOpenChange={setCreate} />}
    </div>
  );
}
