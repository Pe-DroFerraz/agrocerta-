import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export const number = (value: number | null, maximumFractionDigits = 1) =>
  value === null ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value);
export const currency = (value: number | null) =>
  value === null
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export const date = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(value));
export const roleLabels: Record<string, string> = {
  OWNER: 'Dono / Gestor',
  PRODUCTION: 'Produção',
  SALES: 'Comercial',
  DRIVER: 'Entregador',
};
export const statusLabels: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venda',
  LOSS: 'Perda',
  ADJUSTMENT: 'Ajuste',
  PRODUCTION: 'Produção',
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  TRANSFER: 'Transferência',
  DEMO_OPENING: 'Saldo inicial de demonstração',
  DELINQUENT: 'Inadimplente',
  CONSUMER: 'Consumidor',
  NEW: 'Novo',
  CONFIRMED: 'Confirmado',
  PICKING: 'Em separação',
  READY: 'Pronto',
  IN_ROUTE: 'Em rota',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  RELEASED: 'Liberado',
  BLOCKED: 'Bloqueado',
  MATURING: 'Em maturação',
  EXPIRED: 'Vencido',
  IN_PRODUCTION: 'Em produção',
  EXHAUSTED: 'Esgotado',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  MARKET: 'Mercado',
  BAKERY: 'Padaria',
  RESTAURANT: 'Restaurante',
  EMPORIUM: 'Empório',
};
