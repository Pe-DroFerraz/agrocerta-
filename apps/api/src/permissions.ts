import type { RoleKey } from '@prisma/client';
export const roleLabels: Record<RoleKey, string> = {
  OWNER: 'Dono / Gestor',
  PRODUCTION: 'Produção',
  SALES: 'Comercial',
  DRIVER: 'Entregador',
};
export const permissions = {
  OWNER: [
    'dashboard',
    'producers',
    'receipts',
    'products',
    'batches',
    'supplies',
    'customers',
    'orders',
    'deliveries',
    'finance',
    'announcements',
    'users',
  ],
  PRODUCTION: ['dashboard', 'producers', 'receipts', 'products', 'batches', 'supplies'],
  SALES: ['dashboard', 'customers', 'orders', 'deliveries', 'announcements'],
  DRIVER: ['deliveries'],
} satisfies Record<RoleKey, string[]>;
export type Permission = (typeof permissions.OWNER)[number];
export function allowed(role: RoleKey, permission: Permission) {
  return (permissions[role] as readonly string[]).includes(permission);
}
