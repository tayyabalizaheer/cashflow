import { Decimal } from "decimal.js";
import { assertSameCurrency, decimal } from "./money.js";

export type LoanRepaymentInput = {
  amount: Decimal.Value;
  currency: string;
  adjustment?: boolean;
  archivedAt?: Date | null;
};

export function calculateLoanBalance(
  originalAmount: Decimal.Value,
  currency: string,
  repayments: LoanRepaymentInput[]
) {
  const activeRepayments = repayments.filter((repayment) => !repayment.archivedAt);
  assertSameCurrency([currency, ...activeRepayments.map((repayment) => repayment.currency)]);

  const totalRepaid = activeRepayments.reduce(
    (sum, repayment) => sum.plus(decimal(repayment.amount)),
    new Decimal(0)
  );
  const remaining = Decimal.max(decimal(originalAmount).minus(totalRepaid), 0);

  return {
    totalRepaid,
    remaining,
    isOverpaid: totalRepaid.gt(decimal(originalAmount))
  };
}

export function nextLoanStatus(
  originalAmount: Decimal.Value,
  currency: string,
  repayments: LoanRepaymentInput[],
  dueDate?: Date | null,
  now = new Date()
) {
  const { totalRepaid, remaining } = calculateLoanBalance(originalAmount, currency, repayments);
  if (remaining.eq(0)) return "PAID";
  if (dueDate && dueDate.getTime() < now.getTime()) return "OVERDUE";
  if (totalRepaid.gt(0)) return "PARTIALLY_PAID";
  return "ACTIVE";
}
