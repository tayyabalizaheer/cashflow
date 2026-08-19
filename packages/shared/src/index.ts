import { z } from "zod";

export const isoCurrencySchema = z.string().length(3).transform((value) => value.toUpperCase());
export const moneyInputSchema = z.union([z.string(), z.number()]).refine((value) => Number(value) >= 0);
export const positiveMoneyInputSchema = z.union([z.string(), z.number()]).refine((value) => Number(value) > 0);

export const zakatDisclaimer =
  "This is an estimate for planning only. Consult a qualified scholar or adviser for personal guidance.";

export const defaultExpenseCategories = [
  "Housing",
  "Food",
  "Transport",
  "Utilities",
  "Health",
  "Education",
  "Entertainment",
  "Charity",
  "Shopping",
  "Other"
] as const;
