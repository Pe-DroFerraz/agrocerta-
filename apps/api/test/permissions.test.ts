import { it, expect } from 'vitest';
import { allowed, permissions } from '../src/permissions.js';
it('dono acessa todos os recursos; motorista só entregas', () => {
  for (const p of permissions.OWNER) expect(allowed('OWNER', p)).toBe(true);
  expect(permissions.DRIVER).toEqual(['deliveries']);
  expect(allowed('DRIVER', 'finance')).toBe(false);
});
it('isola produção e comercial dos dados financeiros e administração', () => {
  expect(allowed('PRODUCTION', 'producers')).toBe(true);
  expect(allowed('PRODUCTION', 'customers')).toBe(false);
  expect(allowed('SALES', 'customers')).toBe(true);
  expect(allowed('SALES', 'producers')).toBe(false);
  for (const r of ['PRODUCTION', 'SALES'] as const) {
    expect(allowed(r, 'users')).toBe(false);
    expect(allowed(r, 'finance')).toBe(false);
  }
});
