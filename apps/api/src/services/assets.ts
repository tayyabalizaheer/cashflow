import { prisma } from "../config/prisma.js";

type LinkedAssetRecord = {
  id: string;
  sourceExpenseId?: string | null;
  sourceCurrency?: string | null;
  currency: string;
  name: string;
} & Record<string, unknown>;

export async function linkedAssetValues<T extends LinkedAssetRecord>(
  assets: T[],
  userId: string,
) {
  const expenseIds = [
    ...new Set(
      assets
        .map((asset) => asset.sourceExpenseId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (expenseIds.length === 0) return assets;

  const expenses = await prisma.expense.findMany({
    where: { userId, id: { in: expenseIds }, archivedAt: null },
    include: {
      transactions: {
        where: { archivedAt: null },
        include: { amounts: true },
      },
    },
  });
  const totalsByExpense = new Map<string, Map<string, number>>();
  const namesByExpense = new Map<string, string>();

  expenses.forEach((expense) => {
    namesByExpense.set(expense.id, expense.name ?? expense.purpose);
    const totals = new Map<string, number>();
    expense.transactions.forEach((transaction) => {
      transaction.amounts.forEach((amount) => {
        totals.set(
          amount.currencyCode,
          (totals.get(amount.currencyCode) ?? 0) + Number(amount.amount),
        );
      });
    });
    if (totals.size === 0) {
      totals.set(
        expense.mainCurrency ?? expense.currency,
        Number(expense.amount),
      );
    }
    totalsByExpense.set(expense.id, totals);
  });

  return assets.map((asset) => {
    if (!asset.sourceExpenseId) return asset;
    const linkedTotals = totalsByExpense.get(asset.sourceExpenseId);
    if (!linkedTotals) return asset;

    const currencyCode = asset.sourceCurrency ?? asset.currency;
    const linkedValue = linkedTotals.get(currencyCode) ?? 0;
    const expenseName = namesByExpense.get(asset.sourceExpenseId);
    return {
      ...asset,
      ...(expenseName ? { name: expenseName } : {}),
      value: linkedValue.toFixed(4),
      currency: currencyCode,
    } as T;
  });
}

export function groupedAssetCount(assets: LinkedAssetRecord[]) {
  return new Set(
    assets.map((asset) => asset.sourceExpenseId ?? `asset:${asset.id}`),
  ).size;
}
