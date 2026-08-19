import { Decimal } from "decimal.js";

export function decimal(value: Decimal.Value) {
  const next = new Decimal(value);
  if (!next.isFinite()) {
    throw new Error("Amount must be finite");
  }
  return next;
}

export function assertSameCurrency(currencies: string[]) {
  const unique = new Set(currencies.map((currency) => currency.toUpperCase()));
  if (unique.size > 1) {
    throw new Error("Mixed currencies require explicit exchange rates");
  }
}

export function toMoneyString(value: Decimal.Value) {
  return decimal(value).toDecimalPlaces(4).toFixed(4);
}

export function applyPercentage(amount: Decimal.Value, percentage: Decimal.Value) {
  return decimal(amount).mul(decimal(percentage).div(100));
}
