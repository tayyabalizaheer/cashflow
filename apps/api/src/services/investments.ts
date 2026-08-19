import { Decimal } from "decimal.js";
import { decimal } from "./money.js";

export function calculateInvestmentValue(input: {
  amountInvested: Decimal.Value;
  quantity?: Decimal.Value | null;
  nav?: Decimal.Value | null;
  currentValue?: Decimal.Value | null;
}) {
  const costBasis = decimal(input.amountInvested);
  const currentValue =
    input.quantity != null && input.nav != null
      ? decimal(input.quantity).mul(decimal(input.nav))
      : input.currentValue != null
        ? decimal(input.currentValue)
        : null;

  const gainLoss = currentValue ? currentValue.minus(costBasis) : null;
  const gainLossPercentage =
    gainLoss && !costBasis.eq(0) ? gainLoss.div(costBasis).mul(100) : null;

  return {
    costBasis,
    currentValue,
    gainLoss,
    gainLossPercentage
  };
}
