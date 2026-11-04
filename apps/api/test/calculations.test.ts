import { describe, it, expect } from 'vitest';
import { calculateCost, yieldRatio } from '../src/calculations.js';
const example = {
  milk: [
    { liters: 600, price: '2.30' },
    { liters: 400, price: '2.50' },
  ],
  supplies: [
    { quantity: 2, unitCost: 40 },
    { quantity: 100, unitCost: 1 },
  ],
  monthlyFixed: 3000,
  monthlyProduction: 1000,
  quantity: 100,
  liters: 1000,
  losses: 20,
  salePrice: 40,
};
describe('Custo do lote', () => {
  it('soma leite, insumos, rateio proporcional e perdas sem arredondar intermediários', () => {
    const cost = calculateCost(example);
    expect(cost.milk.toNumber()).toBe(2380);
    expect(cost.supplies.toNumber()).toBe(180);
    expect(cost.overhead.toNumber()).toBe(300);
    expect(cost.total.toNumber()).toBe(2880);
    expect(cost.perUnit.toNumber()).toBe(28.8);
    expect(cost.perLiter.toNumber()).toBe(2.88);
    expect(cost.margin).toBeCloseTo(0.28);
  });
  it('rateia produtos líquidos pelo peso equivalente sem misturar unidades', () => {
    const c = calculateCost({ ...example, allocationWeightKg: 103 });
    expect(c.overhead.toNumber()).toBe(309);
    expect(c.perUnit.toNumber()).toBe(28.89);
  });
  it('preserva precisão monetária decimal', () => {
    const c = calculateCost({
      ...example,
      milk: [{ liters: 3, price: '.1' }],
      supplies: [],
      monthlyFixed: 0,
      losses: 0,
      quantity: 3,
      liters: 3,
    });
    expect(c.total.toString()).toBe('0.3');
    expect(c.perUnit.toString()).toBe('0.1');
  });
  it('não divide por zero nem aceita custos negativos', () => {
    expect(() => calculateCost({ ...example, quantity: 0 })).toThrow();
    expect(() => calculateCost({ ...example, liters: 0 })).toThrow();
    expect(() => calculateCost({ ...example, monthlyProduction: 0 })).toThrow();
    expect(() => calculateCost({ ...example, losses: -1 })).toThrow();
    expect(calculateCost({ ...example, salePrice: 0 }).margin).toBeNull();
  });
  it('calcula o impacto de R$ 0,20 a mais no preço de cada litro', () => {
    const base = calculateCost(example);
    const changed = calculateCost({
      ...example,
      milk: example.milk.map((m) => ({ ...m, price: Number(m.price) + 0.2 })),
    });
    expect(changed.total.minus(base.total).toNumber()).toBe(200);
    expect(changed.perUnit.minus(base.perUnit).toNumber()).toBe(2);
  });
});
describe('Rendimento', () => {
  it('aponta consumo de leite acima de 10% do esperado', () => {
    expect(yieldRatio(1200, 100, 10)).toEqual({ actual: 12, deviation: 0.2, status: 'warning' });
    expect(yieldRatio(1000, 100, 10).status).toBe('normal');
    expect(yieldRatio(1100, 100, 10).status).toBe('normal');
  });
  it('rejeita quantidades inválidas', () => {
    expect(() => yieldRatio(1000, 0, 10)).toThrow();
    expect(() => yieldRatio(-1, 100, 10)).toThrow();
  });
});
