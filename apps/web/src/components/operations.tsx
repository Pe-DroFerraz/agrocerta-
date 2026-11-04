import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  PenLine,
  Eye,
  Loader2,
  Trash2,
  ArrowRight,
  Milk,
  Factory,
  ShoppingBag,
  PackageCheck,
  Truck,
  Ban,
  CheckCircle2,
  Wallet,
  ClipboardList,
} from 'lucide-react';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { downloadFile } from '../traceability';
import { useAuth } from '../lib/auth';
import { currency, date, number, statusLabels } from '../lib/utils';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { ErrorState } from './feedback';
type RecordData = Record<string, unknown>;
interface Option {
  id: string;
  name: string;
  [key: string]: unknown;
}
interface Lookups {
  producers: Option[];
  products: Option[];
  supplies: Option[];
  customers: Option[];
  routes: Option[];
  vehicles: Option[];
  drivers: Option[];
  milkReceipts: Option[];
}
type Action =
  | 'producer'
  | 'product'
  | 'customer'
  | 'receipt'
  | 'production'
  | 'order'
  | 'purchase'
  | 'supply'
  | 'dispatch'
  | 'complete'
  | 'event'
  | 'batch-status'
  | 'adjust'
  | 'receive-payment'
  | 'pay-payment'
  | 'payable'
  | 'announcement'
  | 'details'
  | 'archive'
  | 'quality'
  | 'order-status'
  | 'delete-announcement';
export interface OperationSelection {
  action: Action;
  resource: string;
  row?: RecordData;
  target?: string;
}
type Selection = OperationSelection;
interface Field {
  key: string;
  label: string;
  type?: 'number' | 'date' | 'textarea' | 'checkbox' | 'select';
  options?: { value: string; label: string }[];
  lookup?: keyof Lookups;
  initial?: string | boolean;
  required?: boolean;
  hint?: string;
}
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const object = (value: unknown) =>
  value && typeof value === 'object' ? (value as RecordData) : {};
const array = (value: unknown) => (Array.isArray(value) ? value.map(object) : []);
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const opts = (values: string[]) =>
  values.map((value) => ({
    value,
    label:
      statusLabels[value] ??
      {
        PIX: 'Pix',
        BOLETO: 'Boleto',
        CASH: 'Dinheiro',
        CARD: 'Cartão',
        TRANSFER: 'Transferência',
        ABSENT: 'Cliente ausente',
        RETURN: 'Devolução informada',
        NOTE: 'Observação',
        CONSUMER: 'Consumidor',
      }[value] ??
      value,
  }));
const basic: Record<string, Field[]> = {
  producer: [
    { key: 'name', label: 'Nome do produtor' },
    { key: 'farm', label: 'Propriedade' },
    { key: 'city', label: 'Município' },
    { key: 'phone', label: 'Telefone / WhatsApp' },
    { key: 'document', label: 'CPF / CNPJ ou identificador demo' },
    { key: 'pricePerLiter', label: 'Preço por litro (R$)', type: 'number' },
    { key: 'qualityBonus', label: 'Bônus por litro (R$)', type: 'number', initial: '0' },
    { key: 'active', label: 'Produtor ativo', type: 'checkbox', initial: true },
  ],
  product: [
    { key: 'code', label: 'Código (letras maiúsculas)' },
    { key: 'name', label: 'Nome do produto' },
    { key: 'unit', label: 'Unidade', type: 'select', options: opts(['kg', 'L', 'un']) },
    { key: 'category', label: 'Categoria' },
    { key: 'salePrice', label: 'Preço de venda (R$)', type: 'number' },
    { key: 'shelfLifeDays', label: 'Validade em dias', type: 'number', initial: '12' },
    { key: 'minimumStock', label: 'Estoque mínimo', type: 'number', initial: '0' },
    {
      key: 'expectedLitersPerUnit',
      label: 'Rendimento esperado (L / unidade)',
      type: 'number',
      initial: '10',
    },
    { key: 'kgPerUnit', label: 'Peso equivalente por unidade (kg)', type: 'number', initial: '1' },
  ],
  customer: [
    { key: 'name', label: 'Nome do cliente' },
    {
      key: 'type',
      label: 'Segmento',
      type: 'select',
      options: opts(['MARKET', 'BAKERY', 'RESTAURANT', 'EMPORIUM', 'CONSUMER']),
    },
    { key: 'document', label: 'CPF / CNPJ ou identificador demo' },
    { key: 'address', label: 'Endereço completo' },
    { key: 'neighborhood', label: 'Bairro' },
    { key: 'city', label: 'Município' },
    { key: 'contact', label: 'Responsável pelo recebimento' },
    { key: 'phone', label: 'Telefone / WhatsApp' },
    { key: 'paymentTermDays', label: 'Prazo de pagamento (dias)', type: 'number', initial: '14' },
    {
      key: 'creditLimit',
      label: 'Limite de crédito (R$; zero = sem limite)',
      type: 'number',
      initial: '2500',
    },
    { key: 'routeId', label: 'Rota padrão', type: 'select', lookup: 'routes', required: false },
    {
      key: 'status',
      label: 'Situação',
      type: 'select',
      options: opts(['ACTIVE', 'INACTIVE', 'DELINQUENT']),
    },
    { key: 'notes', label: 'Observações', type: 'textarea', required: false },
  ],
  receipt: [
    { key: 'producerId', label: 'Produtor', type: 'select', lookup: 'producers' },
    { key: 'liters', label: 'Volume recebido (L)', type: 'number' },
    { key: 'temperature', label: 'Temperatura (°C)', type: 'number', initial: '4' },
    { key: 'acidity', label: 'Acidez (°D)', type: 'number', initial: '16' },
    { key: 'fat', label: 'Gordura (%)', type: 'number', initial: '3.8' },
    { key: 'protein', label: 'Proteína (%)', type: 'number', initial: '3.3' },
    { key: 'scc', label: 'CCS (células / mL)', type: 'number', initial: '200000' },
    { key: 'approved', label: 'Aprovar leite para produção', type: 'checkbox', initial: true },
  ],
  production: [
    { key: 'productId', label: 'Produto', type: 'select', lookup: 'products' },
    {
      key: 'receiptId',
      label: 'Origem do leite (opcional)',
      type: 'select',
      lookup: 'milkReceipts',
      required: false,
      hint: 'Sem seleção, o sistema consome os recebimentos aprovados mais antigos.',
    },
    { key: 'liters', label: 'Leite utilizado (L)', type: 'number' },
    { key: 'quantity', label: 'Quantidade efetivamente produzida', type: 'number' },
    {
      key: 'status',
      label: 'Situação inicial do lote',
      type: 'select',
      options: opts(['IN_PRODUCTION', 'MATURING', 'RELEASED']),
    },
    { key: 'notes', label: 'Observações de produção', type: 'textarea', required: false },
  ],
  order: [
    { key: 'customerId', label: 'Cliente', type: 'select', lookup: 'customers' },
    { key: 'deliveryDate', label: 'Data de entrega', type: 'date', initial: today() },
    {
      key: 'paymentMethod',
      label: 'Forma de pagamento',
      type: 'select',
      options: opts(['PIX', 'BOLETO', 'CASH', 'CARD']),
    },
    { key: 'status', label: 'Criar como', type: 'select', options: opts(['CONFIRMED', 'NEW']) },
    { key: 'notes', label: 'Observações do pedido', type: 'textarea', required: false },
  ],
  supply: [
    { key: 'name', label: 'Nome do insumo' },
    { key: 'unit', label: 'Unidade', type: 'select', options: opts(['kg', 'L', 'g', 'un']) },
    { key: 'unitCost', label: 'Custo unitário (R$)', type: 'number', initial: '1' },
    { key: 'minimumStock', label: 'Estoque mínimo', type: 'number', initial: '0' },
  ],
  purchase: [
    { key: 'supplyId', label: 'Insumo', type: 'select', lookup: 'supplies' },
    { key: 'lotCode', label: 'Lote do fornecedor' },
    { key: 'supplier', label: 'Fornecedor' },
    { key: 'quantity', label: 'Quantidade recebida', type: 'number' },
    { key: 'unitCost', label: 'Custo unitário (R$)', type: 'number' },
    { key: 'expiresAt', label: 'Validade (opcional)', type: 'date', required: false },
  ],
  dispatch: [
    { key: 'routeId', label: 'Rota', type: 'select', lookup: 'routes' },
    { key: 'driverId', label: 'Entregador', type: 'select', lookup: 'drivers' },
    { key: 'vehicleId', label: 'Veículo', type: 'select', lookup: 'vehicles' },
  ],
  complete: [
    { key: 'signature', label: 'Nome de quem recebeu (comprovante)' },
    { key: 'notes', label: 'Observações da entrega', type: 'textarea', required: false },
  ],
  event: [
    {
      key: 'type',
      label: 'Tipo de ocorrência',
      type: 'select',
      options: opts(['ABSENT', 'RETURN', 'NOTE']),
    },
    { key: 'description', label: 'Descreva o que aconteceu', type: 'textarea' },
  ],
  'batch-status': [
    { key: 'reason', label: 'Motivo da mudança (mínimo 5 caracteres)', type: 'textarea' },
  ],
  adjust: [
    { key: 'newQuantity', label: 'Saldo físico após a operação', type: 'number' },
    { key: 'reason', label: 'Motivo do ajuste (mínimo 5 caracteres)', type: 'textarea' },
    {
      key: 'loss',
      label: 'Registrar redução como perda com custo',
      type: 'checkbox',
      initial: true,
    },
  ],
  'receive-payment': [
    { key: 'amount', label: 'Valor recebido (R$)', type: 'number' },
    {
      key: 'method',
      label: 'Forma de recebimento',
      type: 'select',
      options: opts(['PIX', 'CASH', 'CARD', 'TRANSFER', 'BOLETO']),
    },
  ],
  'pay-payment': [
    { key: 'amount', label: 'Valor pago (R$)', type: 'number' },
    {
      key: 'method',
      label: 'Forma de pagamento',
      type: 'select',
      options: opts(['PIX', 'CASH', 'CARD', 'TRANSFER', 'BOLETO']),
    },
  ],
  payable: [
    { key: 'description', label: 'Descrição da conta' },
    { key: 'category', label: 'Categoria' },
    { key: 'amount', label: 'Valor (R$)', type: 'number' },
    { key: 'dueDate', label: 'Vencimento', type: 'date', initial: today() },
  ],
  announcement: [
    { key: 'title', label: 'Título do aviso' },
    { key: 'content', label: 'Mensagem para a equipe', type: 'textarea' },
  ],
};
const titles: Record<Action, string> = {
  producer: 'Produtor',
  product: 'Produto e ficha técnica',
  customer: 'Cliente',
  receipt: 'Receber leite',
  production: 'Nova produção',
  order: 'Pedido',
  purchase: 'Entrada de insumo',
  supply: 'Insumo',
  dispatch: 'Planejar saída para entrega',
  complete: 'Concluir entrega',
  event: 'Registrar ocorrência',
  'batch-status': 'Alterar situação do lote',
  adjust: 'Inventário e perdas',
  'receive-payment': 'Receber pagamento',
  'pay-payment': 'Pagar conta',
  payable: 'Nova conta a pagar',
  announcement: 'Publicar aviso',
  details: 'Detalhes e histórico',
  archive: 'Arquivar cadastro',
  quality: 'Alterar aprovação do leite',
  'order-status': 'Atualizar pedido',
  'delete-announcement': 'Excluir aviso',
};
export function OperationalDialog({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const { user } = useAuth();
  const { action, resource, row, target } = selection;
  const recordId = text(row?.id);
  const fields = basic[action] ?? [];
  const needsDetail =
    !!recordId && ['producer', 'product', 'customer', 'order', 'details'].includes(action);
  const detail = useQuery({
    queryKey: ['record', resource, recordId],
    queryFn: () => api<RecordData>(`/ops/${resource}/${recordId}`),
    enabled: needsDetail,
  });
  const lookups = useQuery({
    queryKey: ['lookups', user!.id],
    queryFn: () => api<Lookups>('/ops/lookups'),
    enabled: fields.some((f) => f.lookup) || ['product', 'customer', 'order'].includes(action),
  });
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [lines, setLines] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState('');
  const key = useRef({ body: '', key: '' });
  useEffect(() => {
    if (needsDetail && !detail.data) return;
    const data = detail.data ?? row ?? {};
    const next: Record<string, string | boolean> = {};
    for (const f of fields) {
      let value = data[f.key] ?? f.initial ?? f.options?.[0]?.value ?? '';
      if (f.type === 'date' && value) value = text(value).slice(0, 10);
      next[f.key] = f.type === 'checkbox' ? Boolean(value) : text(value);
    }
    if (action === 'adjust') next.newQuantity = text(row?.quantity ?? row?.availableQuantity ?? 0);
    if (action === 'receive-payment' || action === 'pay-payment')
      next.amount = text(Math.max(0, Number(row?.amount ?? 0) - Number(row?.paidAmount ?? 0)));
    if (action === 'purchase' && recordId) next.supplyId = recordId;
    setValues(next);
    const collection =
      action === 'product' ? 'recipes' : action === 'customer' ? 'prices' : 'items';
    const existing = array(data[collection]);
    setLines(
      existing.length
        ? existing.map((v) => ({
            productId: text(v.productId),
            supplyId: text(v.supplyId),
            quantity: text(v.quantity ?? 1),
            unitPrice: text(v.unitPrice),
            quantityPerUnit: text(v.quantityPerUnit),
            price: text(v.price),
          }))
        : [
            {
              productId: '',
              supplyId: '',
              quantity: '1',
              unitPrice: '',
              quantityPerUnit: '',
              price: '',
            },
          ],
    );
    // O formulário é reiniciado somente ao receber o registro solicitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, recordId, action]);
  const mutation = useMutation({
    mutationFn: async () => {
      setError('');
      const body: RecordData = {};
      for (const f of fields) {
        const v = values[f.key];
        if (
          f.required === false &&
          (v === '' || v === undefined) &&
          ['date', 'select'].includes(f.type ?? '')
        )
          continue;
        body[f.key] =
          f.type === 'number'
            ? Number(v)
            : f.type === 'date'
              ? new Date(`${v}T12:00:00-03:00`).toISOString()
              : v;
      }
      let path = '';
      let method = recordId ? 'PUT' : 'POST';
      if (
        action === 'producer' ||
        action === 'product' ||
        action === 'customer' ||
        action === 'supply'
      ) {
        path = `/${resource}${recordId ? `/${recordId}` : ''}`;
        if (action === 'product')
          body.recipes = lines
            .filter((l) => l.supplyId)
            .map((l) => ({ supplyId: l.supplyId, quantityPerUnit: Number(l.quantityPerUnit) }));
        if (action === 'customer' && !values.routeId) body.routeId = null;
        if (action === 'customer')
          body.prices = lines
            .filter((l) => l.productId)
            .map((l) => ({ productId: l.productId, price: Number(l.price) }));
      }
      if (action === 'receipt') {
        path = '/receipts';
        method = 'POST';
      }
      if (action === 'production') {
        path = '/production';
        method = 'POST';
        if (body.receiptId) body.receiptIds = [body.receiptId];
        delete body.receiptId;
      }
      if (action === 'order') {
        path = `/orders${recordId ? `/${recordId}` : ''}`;
        body.items = lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          ...(l.unitPrice ? { unitPrice: Number(l.unitPrice) } : {}),
        }));
      }
      if (action === 'purchase') {
        path = '/stock/purchase';
        method = 'POST';
      }
      if (action === 'dispatch') {
        path = `/orders/${recordId}/dispatch`;
        method = 'POST';
      }
      if (action === 'complete' || action === 'event') {
        path = `/deliveries/${recordId}/${action === 'complete' ? 'complete' : 'events'}`;
        method = 'POST';
      }
      if (action === 'batch-status') {
        path = `/batches/${recordId}/status`;
        method = 'PATCH';
        body.status = target;
      }
      if (action === 'adjust') {
        path = '/stock/adjust';
        method = 'POST';
        body.batchId = recordId;
      }
      if (action === 'receive-payment' || action === 'pay-payment') {
        path = `/${action === 'receive-payment' ? 'receivables' : 'payables'}/${recordId}/pay`;
        method = 'POST';
      }
      if (action === 'payable') {
        path = '/payables';
        method = 'POST';
      }
      if (action === 'announcement') {
        path = `/announcements${recordId ? `/${recordId}` : ''}`;
        method = recordId ? 'PUT' : 'POST';
      }
      if (action === 'delete-announcement') {
        path = `/announcements/${recordId}`;
        method = 'DELETE';
      }
      if (action === 'archive') {
        path = `/${resource}/${recordId}`;
        method = 'DELETE';
      }
      if (action === 'quality') {
        path = `/receipts/${recordId}/quality`;
        method = 'PATCH';
        body.approved = target === 'true';
      }
      if (action === 'order-status') {
        path = `/orders/${recordId}/status`;
        method = 'PATCH';
        body.status = target;
      }
      const serialized = JSON.stringify({ path, method, body });
      if (key.current.body !== serialized)
        key.current = { body: serialized, key: crypto.randomUUID() };
      return api(path, {
        method,
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': key.current.key },
      });
    },
    onSuccess: () => {
      toast.success('Operação registrada com sucesso.');
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  const updateLine = (i: number, k: string, v: string) =>
    setLines((ls) => ls.map((l, n) => (i === n ? { ...l, [k]: v } : l)));
  const loading = (needsDetail && detail.isPending) || (lookups.isEnabled && lookups.isPending);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle className="font-heading text-xl font-bold">
          {titles[action]}
          {recordId && ['producer', 'product', 'customer', 'order', 'supply'].includes(action)
            ? ' · editar'
            : ''}
        </DialogTitle>
        <DialogDescription className="mt-2 text-xs leading-6 text-muted">
          {action === 'production'
            ? 'Consome leite aprovado e insumos, calcula custos e gera o lote em uma única operação.'
            : action === 'order'
              ? 'Pedidos confirmados reservam lotes por validade. A baixa física e o recebível acontecem na entrega.'
              : action === 'details'
                ? 'Informações persistidas e histórico deste registro.'
                : action === 'archive'
                  ? 'O cadastro será arquivado. O histórico permanece disponível nas operações anteriores.'
                  : action === 'quality'
                    ? 'Leite consumido e recebimentos pagos não podem ter a aprovação alterada.'
                    : 'As alterações serão gravadas no banco e registradas no histórico da operação.'}
        </DialogDescription>
        {loading ? (
          <p role="status" className="py-10 text-sm text-muted">
            Carregando dados…
          </p>
        ) : detail.error || lookups.error ? (
          <ErrorState
            message={(detail.error ?? lookups.error)!.message}
            retry={() => {
              void detail.refetch();
              void lookups.refetch();
            }}
          />
        ) : action === 'details' ? (
          <RecordDetails resource={resource} data={detail.data ?? {}} />
        ) : (
          <form
            className="mt-5 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <label htmlFor={`op-${f.key}`}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select
                      id={`op-${f.key}`}
                      required={f.required !== false}
                      value={text(values[f.key])}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    >
                      {f.lookup && (
                        <option value="">
                          {f.required === false ? 'Seleção automática / sem vínculo' : 'Selecione…'}
                        </option>
                      )}
                      {(
                        f.options ??
                        lookups.data?.[f.lookup!]?.map((o) => ({ value: o.id, label: o.name })) ??
                        []
                      ).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'checkbox' ? (
                    <input
                      id={`op-${f.key}`}
                      type="checkbox"
                      className="h-5 w-5 accent-primary"
                      checked={Boolean(values[f.key])}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                    />
                  ) : f.type === 'textarea' ? (
                    <textarea
                      id={`op-${f.key}`}
                      rows={3}
                      required={f.required !== false}
                      value={text(values[f.key])}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full rounded-xl border bg-transparent p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                  ) : (
                    <input
                      id={`op-${f.key}`}
                      required={f.required !== false}
                      type={f.type ?? 'text'}
                      step={f.type === 'number' ? 'any' : undefined}
                      value={text(values[f.key])}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}{' '}
                  {f.hint && <p className="mt-2 text-[10px] leading-5 text-muted">{f.hint}</p>}
                </div>
              ))}
            </div>
            {['product', 'customer', 'order'].includes(action) && (
              <fieldset className="rounded-xl border p-4">
                <legend className="px-2 text-xs font-semibold">
                  {action === 'product'
                    ? 'Ficha técnica · insumos por unidade'
                    : action === 'customer'
                      ? 'Tabela de preços personalizada (opcional)'
                      : 'Itens do pedido'}
                </legend>
                <div className="space-y-4">
                  {lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-[1fr_90px_32px] items-end gap-2">
                      <div>
                        <label htmlFor={`line-select-${i}`} className="text-[10px]">
                          {action === 'product' ? 'Insumo' : 'Produto'}
                        </label>
                        <select
                          id={`line-select-${i}`}
                          required={action === 'order'}
                          value={line[action === 'product' ? 'supplyId' : 'productId']}
                          onChange={(e) =>
                            updateLine(
                              i,
                              action === 'product' ? 'supplyId' : 'productId',
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Selecione…</option>
                          {(action === 'product'
                            ? lookups.data?.supplies
                            : lookups.data?.products
                          )?.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} ({text(o.unit)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`line-qty-${i}`} className="text-[10px]">
                          {action === 'product'
                            ? 'Qtd./unidade'
                            : action === 'customer'
                              ? 'Preço (R$)'
                              : 'Quantidade'}
                        </label>
                        <input
                          id={`line-qty-${i}`}
                          type="number"
                          step="any"
                          min="0"
                          required={
                            action === 'order' ||
                            !!line[action === 'product' ? 'supplyId' : 'productId']
                          }
                          value={
                            line[
                              action === 'product'
                                ? 'quantityPerUnit'
                                : action === 'customer'
                                  ? 'price'
                                  : 'quantity'
                            ]
                          }
                          onChange={(e) =>
                            updateLine(
                              i,
                              action === 'product'
                                ? 'quantityPerUnit'
                                : action === 'customer'
                                  ? 'price'
                                  : 'quantity',
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover item ${i + 1}`}
                        disabled={lines.length === 1 && action === 'order'}
                        onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                      >
                        <Trash2 size={15} />
                      </Button>
                      {action === 'order' && (
                        <div className="col-span-3">
                          <label htmlFor={`line-price-${i}`} className="text-[10px]">
                            Preço unitário negociado (opcional)
                          </label>
                          <input
                            id={`line-price-${i}`}
                            type="number"
                            step=".01"
                            min="0"
                            value={line.unitPrice}
                            placeholder="Usar preço do cliente / produto"
                            onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() =>
                    setLines((ls) => [
                      ...ls,
                      {
                        productId: '',
                        supplyId: '',
                        quantity: '1',
                        quantityPerUnit: '',
                        price: '',
                        unitPrice: '',
                      },
                    ])
                  }
                >
                  <Plus size={14} />
                  Adicionar item
                </Button>
              </fieldset>
            )}
            {['archive', 'quality', 'order-status', 'delete-announcement'].includes(action) && (
              <p className="rounded-xl bg-primary/5 p-4 text-sm">
                {action === 'delete-announcement'
                  ? `Excluir o aviso ${row?.title ?? ''}?`
                  : action === 'archive'
                    ? `Arquivar ${row?.name ?? 'este registro'}?`
                    : action === 'quality'
                      ? `Confirmar leite como ${target === 'true' ? 'aprovado' : 'reprovado'}?`
                      : `Confirmar situação: ${statusLabels[target ?? '']}?`}
              </p>
            )}
            {action === 'adjust' && (
              <p className="text-xs text-muted">
                Saldo atual: {number(Number(row?.quantity ?? row?.availableQuantity))}. Reservado:{' '}
                {number(Number(row?.reserved ?? row?.reservedQuantity ?? 0))}.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Confirmar operação
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
function RecordDetails({ resource, data }: { resource: string; data: RecordData }) {
  const { user } = useAuth();
  const entries =
    resource === 'producers'
      ? array(data.receipts)
      : resource === 'customers'
        ? array(data.orders)
        : resource === 'orders'
          ? array(data.history)
          : resource === 'supplies'
            ? array(data.movements)
            : array(data.movements);
  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-xl bg-primary/5 p-4">
        <h3 className="font-heading font-bold">
          {text(data.name ?? data.code ?? object(data.product).name)}
        </h3>
        <p className="mt-2 text-xs text-muted">{text(data.city ?? data.category ?? data.status)}</p>
        {data.unitCost !== undefined && (
          <p className="mt-2 text-sm font-semibold">
            Custo por unidade: {currency(Number(data.unitCost))}
          </p>
        )}
      </div>
      {resource === 'producers' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void downloadFile(`/producers/${data.id}/statement.pdf`, 'extrato-produtor.pdf').catch(
              (e: Error) => toast.error(e.message),
            );
          }}
        >
          Extrato mensal
        </Button>
      )}
      {resource === 'deliveries' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void downloadFile(
              `/deliveries/${data.id}/receipt.pdf`,
              'comprovante-entrega.pdf',
            ).catch((e: Error) => toast.error(e.message));
          }}
        >
          Canhoto PDF
        </Button>
      )}
      {resource === 'batches' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['milkCost', 'Leite'],
              ['supplyCost', 'Insumos'],
              ['overheadCost', 'Indiretos'],
              ['lossCost', 'Perdas de produção'],
            ].map(([key, label]) => (
              <div key={key} className="rounded-xl border p-3">
                <p className="text-[10px] text-muted">{label}</p>
                <p className="mt-2 text-sm font-semibold">
                  {currency(Number(object(data.production)[key]))}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            Rendimento real:{' '}
            {number(
              Number(object(data.production).litersUsed) /
                Number(object(data.production).quantityProduced),
              3,
            )}{' '}
            L / {text(object(data.product).unit)} · Esperado:{' '}
            {number(Number(object(data.product).expectedLitersPerUnit), 3)} L /{' '}
            {text(object(data.product).unit)}
          </p>
          <h3 className="text-sm font-semibold">Origem do leite</h3>
          {array(object(data.production).sources).map((s) => (
            <p className="flex justify-between gap-3 text-xs" key={text(s.id)}>
              <span>{text(object(object(s.receipt).producer).name)}</span>
              <strong>{number(Number(s.liters))} L</strong>
            </p>
          ))}
          <h3 className="text-sm font-semibold">Insumos utilizados</h3>
          {array(object(data.production).supplies).map((s) => (
            <p className="flex justify-between gap-3 text-xs" key={text(s.id)}>
              <span>
                {text(object(s.supply).name)} · {text(object(s.purchase).lotCode)}
              </span>
              <strong>{number(Number(s.quantity), 5)}</strong>
            </p>
          ))}
        </>
      )}
      {resource === 'products' && (
        <>
          <h3 className="text-sm font-semibold">Ficha técnica</h3>
          {array(data.recipes).map((r) => (
            <p className="flex justify-between gap-3 text-xs" key={text(r.id)}>
              <span>{text(object(r.supply).name)}</span>
              <strong>
                {number(Number(r.quantityPerUnit), 5)} {text(object(r.supply).unit)} /{' '}
                {text(data.unit)}
              </strong>
            </p>
          ))}
        </>
      )}
      {resource === 'orders' && (
        <>
          <h3 className="text-sm font-semibold">Itens e lotes reservados</h3>
          {array(data.items).map((i) => (
            <p className="flex justify-between gap-3 text-xs" key={text(i.id)}>
              <span>
                {text(object(i.product).name)} · {text(object(i.batch).code) || 'Sem reserva'}
              </span>
              <strong>
                {number(Number(i.quantity))} · {currency(Number(i.unitPrice))}
              </strong>
            </p>
          ))}
        </>
      )}
      {entries.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Histórico recente</h3>
          <div className="max-h-80 divide-y overflow-y-auto rounded-xl border px-4">
            {entries.map((entry, i) => (
              <div
                key={text(entry.id) || i}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"
              >
                <span>
                  {date(text(entry.date ?? entry.createdAt))} ·{' '}
                  {statusLabels[text(entry.status ?? entry.type)] ??
                    text(entry.type ?? entry.code ?? 'Recebimento')}
                </span>
                <span className="font-semibold">
                  {entry.liters !== undefined
                    ? `${number(Number(entry.liters))} L · ${entry.approved ? 'Aprovado' : 'Reprovado'}`
                    : entry.total !== undefined
                      ? currency(Number(entry.total))
                      : entry.quantity !== undefined
                        ? number(Number(entry.quantity), 5)
                        : text(entry.actorName)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {resource === 'producers' && array(data.payables).length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Pagamentos e contas do produtor</h3>
          <div className="max-h-72 space-y-3 overflow-auto">
            {array(data.payables).map((p) => (
              <article key={text(p.id)} className="rounded-xl border p-3">
                <p className="text-xs font-semibold">{text(p.description)}</p>
                <p className="mt-2 text-xs text-muted">
                  Vence {date(text(p.dueDate))} · Valor {currency(Number(p.amount))} · Pago{' '}
                  {currency(Number(p.paidAmount))}
                </p>
                {user!.role === 'OWNER' && (
                  <div className="mt-3">
                    <RecordActions resource="payables" row={p} />
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {resource === 'customers' && (
        <p className="text-xs text-muted">
          Saldo em aberto nos pedidos exibidos:{' '}
          {currency(
            array(data.orders).reduce(
              (s, o) =>
                s +
                Number(object(o.receivable).amount ?? 0) -
                Number(object(o.receivable).paidAmount ?? 0),
              0,
            ),
          )}
        </p>
      )}
    </div>
  );
}
export function OperationalTools({ resource }: { resource: string }) {
  const { user } = useAuth();
  const [selection, setSelection] = useState<Selection | null>(null);
  const primary: Record<string, { action: Action; label: string; icon: typeof Plus }> = {
    producers: { action: 'producer', label: 'Novo produtor', icon: Plus },
    receipts: { action: 'receipt', label: 'Receber leite', icon: Milk },
    products: { action: 'product', label: 'Novo produto', icon: Plus },
    batches: { action: 'production', label: 'Nova produção', icon: Factory },
    supplies: { action: 'supply', label: 'Novo insumo', icon: Plus },
    customers: { action: 'customer', label: 'Novo cliente', icon: Plus },
    orders: { action: 'order', label: 'Novo pedido', icon: ShoppingBag },
    finance: { action: 'payable', label: 'Nova conta a pagar', icon: Wallet },
    announcements: { action: 'announcement', label: 'Publicar aviso', icon: Plus },
  };
  const action = primary[resource];
  return (
    <>
      {resource === 'deliveries' && (
        <Button
          variant="outline"
          onClick={() => {
            void downloadFile('/deliveries/manifest.pdf', 'romaneio-do-dia.pdf').catch((e: Error) =>
              toast.error(e.message),
            );
          }}
        >
          Romaneio do dia
        </Button>
      )}
      {action && user!.permissions.includes(resource) && (
        <Button onClick={() => setSelection({ action: action.action, resource })}>
          <action.icon size={15} />
          {action.label}
        </Button>
      )}
      {resource === 'supplies' && (
        <Button variant="outline" onClick={() => setSelection({ action: 'purchase', resource })}>
          <Plus size={15} />
          Entrada de insumo
        </Button>
      )}
      {selection && <OperationalDialog selection={selection} onClose={() => setSelection(null)} />}
    </>
  );
}
export function RecordActions({
  resource,
  row,
  onSelect,
}: {
  resource: string;
  row: RecordData;
  onSelect?: (selection: Selection) => void;
}) {
  const { user } = useAuth();
  const [selection, setSelection] = useState<Selection | null>(null);
  const open = (action: Action, target?: string) => {
    const next = { action, resource, row, target };
    if (onSelect) onSelect(next);
    else setSelection(next);
  };
  const status = text(row.status);
  return (
    <div className="flex flex-wrap gap-1.5">
      {['producers', 'products', 'customers', 'orders', 'batches', 'supplies'].includes(
        resource,
      ) && (
        <Button variant="ghost" size="sm" onClick={() => open('details')}>
          <Eye size={13} />
          Detalhes
        </Button>
      )}
      {['producers', 'products', 'customers', 'supplies'].includes(resource) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            open(
              (
                {
                  producers: 'producer',
                  products: 'product',
                  customers: 'customer',
                  supplies: 'supply',
                } as const
              )[resource as 'producers'],
            )
          }
        >
          <PenLine size={12} />
          Editar
        </Button>
      )}
      {['producers', 'products', 'customers'].includes(resource) && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Arquivar cadastro"
          onClick={() => open('archive')}
        >
          <Trash2 size={13} />
        </Button>
      )}
      {resource === 'receipts' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => open('quality', row.approved ? 'false' : 'true')}
        >
          {row.approved ? <Ban size={12} /> : <CheckCircle2 size={12} />}{' '}
          {row.approved ? 'Reprovar' : 'Aprovar'}
        </Button>
      )}
      {resource === 'orders' && (
        <>
          {['NEW', 'CONFIRMED'].includes(status) && (
            <Button variant="outline" size="sm" onClick={() => open('order')}>
              <PenLine size={12} />
              Editar
            </Button>
          )}
          {({ NEW: 'CONFIRMED', CONFIRMED: 'PICKING', PICKING: 'READY' } as Record<string, string>)[
            status
          ] && (
            <Button
              size="sm"
              onClick={() =>
                open(
                  'order-status',
                  (
                    { NEW: 'CONFIRMED', CONFIRMED: 'PICKING', PICKING: 'READY' } as Record<
                      string,
                      string
                    >
                  )[status],
                )
              }
            >
              <ArrowRight size={12} />
              {
                (
                  { NEW: 'Confirmar', CONFIRMED: 'Separar', PICKING: 'Pronto' } as Record<
                    string,
                    string
                  >
                )[status]
              }
            </Button>
          )}
          {status === 'READY' && user!.role === 'OWNER' && (
            <Button size="sm" onClick={() => open('dispatch')}>
              <Truck size={12} />
              Despachar
            </Button>
          )}
          {!['DELIVERED', 'CANCELLED'].includes(status) && (
            <Button variant="ghost" size="sm" onClick={() => open('order-status', 'CANCELLED')}>
              Cancelar
            </Button>
          )}
        </>
      )}
      {resource === 'producers' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void downloadFile(`/producers/${row.id}/statement.pdf`, 'extrato-produtor.pdf').catch(
              (e: Error) => toast.error(e.message),
            );
          }}
        >
          Extrato mensal
        </Button>
      )}
      {resource === 'deliveries' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void downloadFile(`/deliveries/${row.id}/receipt.pdf`, 'comprovante-entrega.pdf').catch(
              (e: Error) => toast.error(e.message),
            );
          }}
        >
          Canhoto PDF
        </Button>
      )}
      {resource === 'batches' && (
        <>
          <Button asChild variant="outline" size="sm">
            <Link to={`/traceability?code=${encodeURIComponent(text(row.code))}`}>Rastrear</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => open('adjust')}>
            <ClipboardList size={12} />
            Inventário
          </Button>
          {status !== 'EXHAUSTED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => open('batch-status', status === 'RELEASED' ? 'BLOCKED' : 'RELEASED')}
            >
              {status === 'RELEASED' ? <Ban size={12} /> : <PackageCheck size={12} />}{' '}
              {status === 'RELEASED' ? 'Bloquear' : 'Liberar'}
            </Button>
          )}
          {status === 'IN_PRODUCTION' && (
            <Button variant="outline" size="sm" onClick={() => open('batch-status', 'MATURING')}>
              Maturação
            </Button>
          )}
        </>
      )}
      {resource === 'supplies' && (
        <Button variant="outline" size="sm" onClick={() => open('purchase')}>
          Entrada
        </Button>
      )}
      {resource === 'deliveries' &&
        status === 'IN_ROUTE' &&
        ['OWNER', 'DRIVER'].includes(user!.role) && (
          <>
            <Button size="sm" onClick={() => open('complete')}>
              <CheckCircle2 size={12} />
              Concluir
            </Button>
            <Button variant="outline" size="sm" onClick={() => open('event')}>
              Ocorrência
            </Button>
          </>
        )}
      {resource === 'announcements' && (user!.role === 'OWNER' || row.authorId === user!.id) && (
        <>
          <Button variant="outline" size="sm" onClick={() => open('announcement')}>
            <PenLine size={12} />
            Editar aviso
          </Button>
          <Button variant="ghost" size="sm" onClick={() => open('delete-announcement')}>
            <Trash2 size={12} />
            Excluir aviso
          </Button>
        </>
      )}
      {resource === 'finance' && Number(row.amount) > Number(row.paidAmount) && (
        <Button size="sm" onClick={() => open('receive-payment')}>
          <Wallet size={12} />
          Receber
        </Button>
      )}
      {resource === 'payables' && Number(row.amount) > Number(row.paidAmount) && (
        <Button size="sm" onClick={() => open('pay-payment')}>
          <Wallet size={12} />
          Pagar
        </Button>
      )}
      {selection && <OperationalDialog selection={selection} onClose={() => setSelection(null)} />}
    </div>
  );
}

export function OperationsLaunch() {
  const { user } = useAuth();
  const canProduce = user!.permissions.includes('receipts');
  const milk = useQuery({
    queryKey: ['milk-balance'],
    queryFn: () => api<{ availableLiters: string }>('/milk-balance'),
    enabled: canProduce,
  });
  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/[.045] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">DO CAMPO À ENTREGA</p>
          <h2 className="mt-2 font-heading text-base font-bold">Sua operação começa aqui.</h2>
          <p className="mt-2 text-xs text-muted">
            {canProduce
              ? milk.data
                ? `${number(Number(milk.data.availableLiters))} L de leite aprovado disponíveis para produção.`
                : milk.error
                  ? 'Não foi possível consultar o saldo de leite.'
                  : 'Consultando saldo aprovado…'
              : 'Cadastre clientes, reserve os produtos e acompanhe cada pedido.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(canProduce ? ['receipts', 'batches'] : ['customers']).map((r) => (
            <OperationalTools key={r} resource={r} />
          ))}
          {user!.permissions.includes('orders') && <OperationalTools resource="orders" />}
        </div>
      </div>
    </section>
  );
}
