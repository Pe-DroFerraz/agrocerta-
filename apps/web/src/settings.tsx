import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Plus, PenLine, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from './lib/api';
import { currency } from './lib/utils';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Loading, ErrorState } from './components/feedback';
interface Company {
  id: string;
  name: string;
  document: string;
  address: string;
  city: string;
  expiryAlertDays: number;
  qualityParameters: Record<string, number>;
}
interface Asset {
  id: string;
  name: string;
  city?: string;
  plate?: string;
  capacityKg?: string;
}
interface SettingsData {
  company: Company;
  routes: Asset[];
  vehicles: Asset[];
  fixedCosts: { id: string; month: string; category: string; amount: string }[];
  categories: { category: string }[];
}
export default function Settings() {
  const client = useQueryClient();
  const data = useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsData>('/settings') });
  const [form, setForm] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<{
    kind: 'routes' | 'vehicles' | 'fixed-costs';
    asset?: Asset;
  } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const key = useRef({ body: '', key: '' });
  useEffect(() => {
    if (data.data) {
      const c = data.data.company;
      setForm({
        name: c.name,
        document: c.document,
        address: c.address,
        city: c.city,
        expiryAlertDays: String(c.expiryAlertDays),
        maxTemperature: String(c.qualityParameters.maxTemperature),
        minAcidity: String(c.qualityParameters.minAcidity),
        maxAcidity: String(c.qualityParameters.maxAcidity),
        maxScc: String(c.qualityParameters.maxScc),
        minFat: String(c.qualityParameters.minFat ?? 2.8),
        minProtein: String(c.qualityParameters.minProtein ?? 2.9),
      });
    }
  }, [data.data]);
  const change = useMutation({
    mutationFn: async (input: { path: string; method: string; body: unknown }) => {
      const serialized = JSON.stringify(input);
      if (key.current.body !== serialized)
        key.current = { body: serialized, key: crypto.randomUUID() };
      return api(input.path, {
        method: input.method,
        body: JSON.stringify(input.body),
        headers: { 'Idempotency-Key': key.current.key },
      });
    },
    onSuccess: () => {
      toast.success('Configuração salva.');
      setEdit(null);
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const open = (kind: 'routes' | 'vehicles' | 'fixed-costs', asset?: Asset) => {
    setEdit({ kind, asset });
    setFields(
      kind === 'fixed-costs'
        ? { month: new Date().toISOString().slice(0, 7), category: '', amount: '' }
        : {
            name: asset?.name ?? '',
            city: asset?.city ?? '',
            plate: asset?.plate ?? '',
            capacityKg: asset?.capacityKg ?? '',
          },
    );
  };
  if (data.isPending) return <Loading />;
  if (data.error)
    return (
      <ErrorState
        message={data.error.message}
        retry={() => {
          void data.refetch();
        }}
      />
    );
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">A OPERAÇÃO DO SEU JEITO</p>
        <h1 className="page-title mt-2">Configurações operacionais</h1>
      </div>
      <form
        className="card p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate({
            path: '/settings',
            method: 'PUT',
            body: {
              name: form.name,
              document: form.document,
              city: form.city,
              address: form.address,
              expiryAlertDays: Number(form.expiryAlertDays),
              qualityParameters: {
                maxTemperature: Number(form.maxTemperature),
                minAcidity: Number(form.minAcidity),
                maxAcidity: Number(form.maxAcidity),
                maxScc: Number(form.maxScc),
                minFat: Number(form.minFat),
                minProtein: Number(form.minProtein),
              },
            },
          });
        }}
      >
        <h2 className="section-title">Empresa e qualidade do leite</h2>
        <p className="mb-5 mt-2 text-xs leading-6 text-muted">
          Novos recebimentos aprovados devem atender a estes parâmetros. O histórico não é alterado
          retroativamente.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['name', 'Nome da empresa'],
            ['document', 'CNPJ / identificador'],
            ['city', 'Município'],
            ['address', 'Endereço'],
            ['expiryAlertDays', 'Alerta de validade (dias)'],
            ['maxTemperature', 'Temperatura máxima (°C)'],
            ['minAcidity', 'Acidez mínima (°D)'],
            ['maxAcidity', 'Acidez máxima (°D)'],
            ['maxScc', 'CCS máxima'],
            ['minFat', 'Gordura mínima (%)'],
            ['minProtein', 'Proteína mínima (%)'],
          ].map(([key, label], i) => (
            <div key={key}>
              <label htmlFor={`setting-${key}`}>{label}</label>
              <input
                id={`setting-${key}`}
                required
                type={i < 4 ? 'text' : 'number'}
                step="any"
                value={form[key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <Button type="submit" disabled={change.isPending} className="mt-5">
          <Save size={15} />
          Salvar parâmetros
        </Button>
      </form>
      <div className="grid gap-5 xl:grid-cols-2">
        {(['routes', 'vehicles'] as const).map((kind) => (
          <section key={kind} className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="section-title">{kind === 'routes' ? 'Rotas' : 'Veículos'}</h2>
              <Button size="sm" onClick={() => open(kind)}>
                <Plus size={14} />
                Adicionar
              </Button>
            </div>
            <div className="mt-5 space-y-3">
              {data.data[kind].map((a) => (
                <article
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{a.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {kind === 'routes' ? a.city : `${a.plate} · ${a.capacityKg} kg`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Editar ${a.name}`}
                      onClick={() => open(kind, a)}
                    >
                      <PenLine size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${a.name}`}
                      disabled={change.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Excluir ${a.name}? Cadastros com entregas serão preservados.`,
                          )
                        )
                          change.mutate({
                            path: `/settings/${kind}/${a.id}`,
                            method: 'DELETE',
                            body: {},
                          });
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Custos fixos para rateio</h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-muted">
              Salvar recalcula os custos dos lotes do mês, inclusive os já vendidos. Estes
              parâmetros não geram contas a pagar; registre as faturas reais no financeiro.
            </p>
          </div>
          <Button onClick={() => open('fixed-costs')}>
            <Plus size={15} />
            Definir custo mensal
          </Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.data.fixedCosts.map((c) => (
            <button
              key={c.id}
              className="rounded-xl border p-4 text-left hover:border-primary"
              onClick={() => {
                open('fixed-costs');
                setFields({ month: c.month, category: c.category, amount: c.amount });
              }}
            >
              <p className="text-xs font-semibold">{c.category}</p>
              <p className="mt-2 text-xs text-muted">
                {c.month} · {currency(Number(c.amount))}
              </p>
            </button>
          ))}
        </div>
      </section>
      <section className="card p-5">
        <h2 className="section-title">Categorias em uso</h2>
        <p className="mt-2 text-xs text-muted">
          As categorias são definidas no cadastro dos produtos.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.data.categories.map((c) => (
            <span
              key={c.category}
              className="rounded-full bg-primary/10 px-3 py-2 text-xs text-primary dark:text-green-300"
            >
              {c.category}
            </span>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20">
        <h2 className="section-title">Funcionalidades ainda pendentes</h2>
        <p className="mt-2 text-xs leading-6 text-muted">
          O núcleo de recebimento, produção, venda, entrega e financeiro está integrado. Os recursos
          abaixo ainda não estão implementados nesta versão.
        </p>
        <ul className="mt-4 space-y-2 text-xs text-muted">
          {[
            'Kanban com arrastar pedidos',
            'Comprovantes com foto ou assinatura desenhada',
            'Fechamento mensal bloqueável de produtores e custos',
            'Devoluções parciais com estorno de estoque e financeiro',
            'Reordenação avançada de rotas e paradas',
            'Backup e restauração completos',
            'Envio automático pela WhatsApp Cloud API oficial',
          ].map((item) => (
            <li key={item} className="flex items-center justify-between gap-3">
              <span>{item}</span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                Pendente
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Dialog
        open={!!edit}
        onOpenChange={(open) => {
          if (!open && !change.isPending) setEdit(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="font-heading text-xl font-bold">
            {edit?.kind === 'routes'
              ? 'Rota'
              : edit?.kind === 'vehicles'
                ? 'Veículo'
                : 'Custo fixo mensal'}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-6 text-muted">
            {edit?.kind === 'fixed-costs'
              ? 'O valor informado substitui o custo desta categoria no mês e recalcula o rateio.'
              : 'Os dados serão usados no planejamento das entregas.'}
          </DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!edit) return;
              const body =
                edit.kind === 'routes'
                  ? { name: fields.name, city: fields.city }
                  : edit.kind === 'vehicles'
                    ? {
                        name: fields.name,
                        plate: fields.plate,
                        capacityKg: Number(fields.capacityKg),
                      }
                    : {
                        month: fields.month,
                        category: fields.category,
                        amount: Number(fields.amount),
                      };
              change.mutate({
                path: `/settings/${edit.kind}${edit.asset ? `/${edit.asset.id}` : ''}`,
                method: edit.asset ? 'PUT' : 'POST',
                body,
              });
            }}
          >
            {(edit?.kind === 'routes'
              ? [
                  ['name', 'Nome da rota'],
                  ['city', 'Município'],
                ]
              : edit?.kind === 'vehicles'
                ? [
                    ['name', 'Nome do veículo'],
                    ['plate', 'Placa'],
                    ['capacityKg', 'Capacidade (kg)'],
                  ]
                : [
                    ['month', 'Mês'],
                    ['category', 'Categoria'],
                    ['amount', 'Valor (R$)'],
                  ]
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={`asset-${key}`}>{label}</label>
                <input
                  id={`asset-${key}`}
                  required
                  type={
                    key === 'month'
                      ? 'month'
                      : ['amount', 'capacityKg'].includes(key)
                        ? 'number'
                        : 'text'
                  }
                  step="any"
                  value={fields[key] ?? ''}
                  onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <Button type="submit" disabled={change.isPending} className="w-full">
              {edit?.kind === 'fixed-costs' ? 'Salvar e recalcular' : 'Salvar cadastro'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
