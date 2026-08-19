import { Decimal } from "decimal.js";
import { assertSameCurrency, decimal } from "./money.js";

export type ZakatItem = {
  label: string;
  amount: Decimal.Value;
  currency: string;
  included: boolean;
  kind: "ASSET" | "INVESTMENT" | "CASH" | "RECEIVABLE" | "LIABILITY" | "EXEMPT" | "MANUAL";
  eligibilityPct?: Decimal.Value;
};

export function calculateZakat(input: {
  currency: string;
  nisabThreshold: Decimal.Value;
  rate: Decimal.Value;
  items: ZakatItem[];
}) {
  assertSameCurrency([input.currency, ...input.items.map((item) => item.currency)]);

  const totals = input.items.reduce(
    (acc, item) => {
      const eligibleAmount = decimal(item.amount).mul(decimal(item.eligibilityPct ?? 100).div(100));
      if (!item.included || item.kind === "EXEMPT") {
        acc.excluded = acc.excluded.plus(eligibleAmount);
      } else if (item.kind === "LIABILITY") {
        acc.deductibleLiabilities = acc.deductibleLiabilities.plus(eligibleAmount);
      } else {
        acc.eligibleWealth = acc.eligibleWealth.plus(eligibleAmount);
      }
      return acc;
    },
    {
      eligibleWealth: new Decimal(0),
      deductibleLiabilities: new Decimal(0),
      excluded: new Decimal(0)
    }
  );

  const zakatableWealth = Decimal.max(totals.eligibleWealth.minus(totals.deductibleLiabilities), 0);
  const thresholdMet = zakatableWealth.greaterThanOrEqualTo(input.nisabThreshold);
  const estimatedZakat = thresholdMet ? zakatableWealth.mul(input.rate) : new Decimal(0);

  return {
    ...totals,
    zakatableWealth,
    thresholdMet,
    estimatedZakat
  };
}
