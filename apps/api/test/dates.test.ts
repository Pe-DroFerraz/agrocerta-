import { it, expect } from 'vitest';
import { dateRange, periodSchema, localDay } from '../src/dates.js';
it('usa o dia de São Paulo, inclusive próximo à meia-noite UTC', () => {
  const now = new Date('2026-11-04T01:00:00Z');
  expect(localDay(now)).toBe('2026-11-03');
  const r = dateRange({ period: 'today' }, now);
  expect(r.start.toISOString()).toBe('2026-11-03T03:00:00.000Z');
  expect(r.end.toISOString()).toBe('2026-11-04T03:00:00.000Z');
});
it('inclui sete dias e o último dia do período personalizado', () => {
  const r = dateRange({ period: '7' }, new Date('2026-11-04T15:00:00Z'));
  expect(+r.end - +r.start).toBe(7 * 86400000);
  const c = dateRange({ period: 'custom', from: '2026-10-01', to: '2026-10-31' });
  expect(c.end.toISOString()).toBe('2026-11-01T03:00:00.000Z');
});
it('rejeita datas impossíveis e intervalos invertidos ou excessivos', () => {
  expect(
    periodSchema.safeParse({ period: 'custom', from: '2026-02-30', to: '2026-03-01' }).success,
  ).toBe(false);
  expect(
    periodSchema.safeParse({ period: 'custom', from: '2026-11-04', to: '2026-11-01' }).success,
  ).toBe(false);
  expect(() => dateRange({ period: 'custom', from: '2020-01-01', to: '2026-01-01' })).toThrow();
});
