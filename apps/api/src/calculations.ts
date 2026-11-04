import { Decimal } from 'decimal.js';
type Amount = Decimal.Value;
const D = (n: Amount) => new Decimal(n);
export function calculateCost(input: {
  milk: { liters: Amount; price: Amount }[];
  supplies: { quantity: Amount; unitCost: Amount }[];
  monthlyFixed: Amount;
  monthlyProduction: Amount;
  allocationWeightKg?: Amount;
  quantity: Amount;
  liters: Amount;
  losses: Amount;
  salePrice: Amount;
}) {
  const { quantity, liters, monthlyProduction } = input;
  if (D(quantity).lte(0) || D(liters).lte(0) || D(monthlyProduction).lte(0))
    throw new Error('Produção e litros devem ser positivos.');
  for (const value of [
    input.monthlyFixed,
    input.losses,
    input.salePrice,
    ...input.milk.flatMap((i) => [i.liters, i.price]),
    ...input.supplies.flatMap((i) => [i.quantity, i.unitCost]),
  ])
    if (D(value).lt(0)) throw new Error('Custos e quantidades não podem ser negativos.');
  const milk = input.milk.reduce((sum, i) => sum.plus(D(i.liters).mul(i.price)), D(0));
  const supplies = input.supplies.reduce((sum, i) => sum.plus(D(i.quantity).mul(i.unitCost)), D(0));
  const weight = input.allocationWeightKg ?? quantity;
  if (D(weight).lte(0)) throw new Error('O peso para rateio deve ser positivo.');
  const overhead = D(input.monthlyFixed).mul(weight).div(monthlyProduction);
  const total = milk.plus(supplies).plus(overhead).plus(input.losses);
  const perUnit = total.div(quantity);
  return {
    milk: milk.toDecimalPlaces(2),
    supplies: supplies.toDecimalPlaces(2),
    overhead: overhead.toDecimalPlaces(2),
    total: total.toDecimalPlaces(2),
    perUnit: perUnit.toDecimalPlaces(4),
    perLiter: total.div(liters).toDecimalPlaces(4),
    margin: D(input.salePrice).gt(0)
      ? D(input.salePrice).minus(perUnit).div(input.salePrice).toNumber()
      : null,
  };
}
export function yieldRatio(liters: number, quantity: number, expected: number) {
  if (quantity <= 0 || liters <= 0 || expected <= 0)
    throw new Error('Rendimento exige valores positivos.');
  const actual = liters / quantity;
  return {
    actual,
    deviation: (actual - expected) / expected,
    status: actual > expected * 1.1 ? 'warning' : 'normal',
  };
}

export function orderTotal(
  items: { quantity: Decimal.Value; unitPrice: Decimal.Value; discount?: Decimal.Value }[],
) {
  return items.reduce((sum, item) => {
    const quantity = D(item.quantity);
    const price = D(item.unitPrice);
    const discount = D(item.discount ?? 0);
    if (
      !quantity.isFinite() ||
      !price.isFinite() ||
      !discount.isFinite() ||
      quantity.lte(0) ||
      price.lt(0) ||
      discount.lt(0) ||
      discount.gt(quantity.mul(price))
    )
      throw new Error('Item de pedido inválido.');
    return sum.plus(quantity.mul(price).minus(discount).toDecimalPlaces(2));
  }, D(0));
}
