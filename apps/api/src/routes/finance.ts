import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { calculateInvestmentValue } from "../services/investments.js";
import { calculateLoanBalance, nextLoanStatus } from "../services/loans.js";
import { calculateZakat } from "../services/zakat.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError, notFound } from "../utils/errors.js";

export const financeRouter = Router();
financeRouter.use(requireAuth);

const currency = z.string().length(3).transform((value) => value.toUpperCase());
const positiveDecimal = z.union([z.string(), z.number()]).refine((value) => Number(value) > 0, {
  message: "Amount must be positive"
});
const nonNegativeDecimal = z.union([z.string(), z.number()]).refine((value) => Number(value) >= 0, {
  message: "Amount cannot be negative"
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  currency: currency.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().optional()
});

function paramUuid(value: unknown) {
  return z.string().uuid().parse(value);
}

function pagination(query: unknown) {
  const parsed = listQuery.parse(query);
  return {
    ...parsed,
    skip: (parsed.page - 1) * parsed.pageSize,
    take: parsed.pageSize
  };
}

function archiveRoute(delegate: any) {
  return asyncHandler(async (req, res) => {
    const id = paramUuid(req.params.id);
    const result = await delegate.updateMany({
      where: { id, userId: req.user!.id, archivedAt: null },
      data: { archivedAt: new Date() }
    });
    if (result.count === 0) throw notFound();
    return res.status(204).send();
  });
}

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1).max(40).default("circle"),
  active: z.boolean().default(true)
});

financeRouter.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize, search } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await Promise.all([
      prisma.expenseCategory.findMany({ where, skip, take, orderBy: { name: "asc" } }),
      prisma.expenseCategory.count({ where })
    ]);
    return res.json({ data: items, meta: { page, pageSize, total } });
  })
);

financeRouter.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body);
    const item = await prisma.expenseCategory.create({ data: { ...input, userId: req.user!.id } });
    return res.status(201).json({ data: item });
  })
);

financeRouter.put(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body);
    const id = paramUuid(req.params.id);
    const item = await prisma.expenseCategory.update({
      where: { id, userId: req.user!.id },
      data: input
    });
    return res.json({ data: item });
  })
);

financeRouter.delete("/categories/:id", archiveRoute(prisma.expenseCategory));

const expenseSchema = z.object({
  categoryId: z.string().uuid(),
  purpose: z.string().trim().min(2).max(200),
  amount: positiveDecimal,
  currency,
  expenseDate: z.coerce.date().default(() => new Date()),
  notes: z.string().max(1000).optional(),
  paymentMethod: z.string().max(80).optional(),
  recurring: z.boolean().default(false),
  frequency: z.string().max(40).optional()
});

financeRouter.get(
  "/expenses",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize, search, currency: requestedCurrency, from, to } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(requestedCurrency ? { currency: requestedCurrency } : {}),
      ...(search ? { purpose: { contains: search, mode: "insensitive" as const } } : {}),
      ...(from || to ? { expenseDate: { gte: from, lte: to } } : {})
    };
    const [items, total] = await Promise.all([
      prisma.expense.findMany({ where, skip, take, include: { category: true }, orderBy: { expenseDate: "desc" } }),
      prisma.expense.count({ where })
    ]);
    return res.json({ data: items, meta: { page, pageSize, total } });
  })
);

financeRouter.post(
  "/expenses",
  asyncHandler(async (req, res) => {
    const input = expenseSchema.parse(req.body);
    const category = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, userId: req.user!.id, archivedAt: null }
    });
    if (!category) throw new ApiError(400, "Category is invalid", "CATEGORY_INVALID");
    const item = await prisma.expense.create({ data: { ...input, userId: req.user!.id } });
    return res.status(201).json({ data: item });
  })
);

financeRouter.put(
  "/expenses/:id",
  asyncHandler(async (req, res) => {
    const input = expenseSchema.parse(req.body);
    const id = paramUuid(req.params.id);
    const item = await prisma.expense.update({ where: { id, userId: req.user!.id }, data: input });
    return res.json({ data: item });
  })
);

financeRouter.delete("/expenses/:id", archiveRoute(prisma.expense));

const loanSchema = z.object({
  person: z.string().trim().min(2).max(120),
  purpose: z.string().trim().min(2).max(200),
  amount: positiveDecimal,
  currency,
  direction: z.enum(["LENT", "BORROWED"]),
  loanDate: z.coerce.date().default(() => new Date()),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional()
});

financeRouter.get(
  "/loans",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize, search, currency: requestedCurrency } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(requestedCurrency ? { currency: requestedCurrency } : {}),
      ...(search ? { person: { contains: search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await Promise.all([
      prisma.loan.findMany({ where, skip, take, include: { repayments: true }, orderBy: { loanDate: "desc" } }),
      prisma.loan.count({ where })
    ]);
    return res.json({ data: items, meta: { page, pageSize, total } });
  })
);

financeRouter.post(
  "/loans",
  asyncHandler(async (req, res) => {
    const input = loanSchema.parse(req.body);
    const item = await prisma.loan.create({ data: { ...input, userId: req.user!.id } });
    return res.status(201).json({ data: item });
  })
);

financeRouter.put(
  "/loans/:id",
  asyncHandler(async (req, res) => {
    const input = loanSchema.parse(req.body);
    const id = paramUuid(req.params.id);
    const repayments = await prisma.loanRepayment.findMany({
      where: { loanId: id, userId: req.user!.id, archivedAt: null }
    });
    const status = nextLoanStatus(input.amount, input.currency, repayments, input.dueDate);
    const item = await prisma.loan.update({
      where: { id, userId: req.user!.id },
      data: { ...input, status }
    });
    return res.json({ data: item });
  })
);

financeRouter.delete("/loans/:id", archiveRoute(prisma.loan));

const repaymentSchema = z.object({
  amount: positiveDecimal,
  currency,
  paymentDate: z.coerce.date().default(() => new Date()),
  notes: z.string().max(1000).optional(),
  adjustment: z.boolean().default(false)
});

financeRouter.post(
  "/loans/:loanId/repayments",
  asyncHandler(async (req, res) => {
    const input = repaymentSchema.parse(req.body);
    const loanId = paramUuid(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, userId: req.user!.id, archivedAt: null }
    });
    if (!loan) throw notFound("Loan not found");
    const activeRepayments = await prisma.loanRepayment.findMany({
      where: { loanId: loan.id, userId: req.user!.id, archivedAt: null }
    });
    const balance = calculateLoanBalance(loan.amount.toString(), loan.currency, activeRepayments);
    if (!input.adjustment && Number(input.amount) > balance.remaining.toNumber()) {
      throw new ApiError(400, "Repayment exceeds remaining balance", "REPAYMENT_EXCEEDS_BALANCE");
    }
    const repayment = await prisma.loanRepayment.create({
      data: { ...input, loanId: loan.id, userId: req.user!.id }
    });
    const repayments = [...activeRepayments, repayment];
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        status: nextLoanStatus(loan.amount.toString(), loan.currency, repayments, loan.dueDate)
      }
    });
    return res.status(201).json({ data: repayment });
  })
);

const investmentSchema = z.object({
  type: z.string().trim().min(2).max(80),
  name: z.string().trim().max(120).optional(),
  amountInvested: positiveDecimal,
  currency,
  quantity: nonNegativeDecimal.optional(),
  nav: nonNegativeDecimal.optional(),
  currentValue: nonNegativeDecimal.optional(),
  purchaseDate: z.coerce.date().optional(),
  latestValuationDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  zakatEligible: z.boolean().default(false),
  zakatPercentage: nonNegativeDecimal.default(100)
});

financeRouter.get(
  "/investments",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize, search, currency: requestedCurrency } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(requestedCurrency ? { currency: requestedCurrency } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await Promise.all([
      prisma.investment.findMany({ where, skip, take, orderBy: { updatedAt: "desc" } }),
      prisma.investment.count({ where })
    ]);
    return res.json({ data: items, meta: { page, pageSize, total } });
  })
);

financeRouter.post(
  "/investments",
  asyncHandler(async (req, res) => {
    const input = investmentSchema.parse(req.body);
    const item = await prisma.investment.create({ data: { ...input, userId: req.user!.id } });
    return res.status(201).json({ data: item, calculations: calculateInvestmentValue(item as any) });
  })
);

financeRouter.put(
  "/investments/:id",
  asyncHandler(async (req, res) => {
    const input = investmentSchema.parse(req.body);
    const id = paramUuid(req.params.id);
    const item = await prisma.investment.update({
      where: { id, userId: req.user!.id },
      data: input
    });
    return res.json({ data: item, calculations: calculateInvestmentValue(item as any) });
  })
);

financeRouter.delete("/investments/:id", archiveRoute(prisma.investment));

const assetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  assetType: z.string().trim().min(2).max(80).default("Other"),
  value: nonNegativeDecimal,
  currency,
  acquisitionDate: z.coerce.date().optional(),
  valuationDate: z.coerce.date().optional(),
  zakatEligible: z.boolean().default(false),
  zakatPercentage: nonNegativeDecimal.default(100),
  notes: z.string().max(1000).optional()
});

for (const [path, delegate, schema, orderBy] of [
  ["/assets", prisma.asset, assetSchema, { updatedAt: "desc" }],
  ["/exchange-rates", prisma.exchangeRate, z.object({
    baseCurrency: currency,
    quoteCurrency: currency,
    rate: positiveDecimal,
    source: z.string().min(2).max(120),
    rateDate: z.coerce.date()
  }), { rateDate: "desc" }]
] as const) {
  financeRouter.get(
    path,
    asyncHandler(async (req, res) => {
      const { skip, take, page, pageSize, currency: requestedCurrency } = pagination(req.query);
      const where =
        path === "/assets"
          ? {
              userId: req.user!.id,
              archivedAt: null,
              ...(requestedCurrency ? { currency: requestedCurrency } : {})
            }
          : {
              userId: req.user!.id
            };
      const [items, total] = await Promise.all([
        (delegate as any).findMany({ where, skip, take, orderBy } as any),
        (delegate as any).count({ where } as any)
      ]);
      return res.json({ data: items, meta: { page, pageSize, total } });
    })
  );
  financeRouter.post(
    path,
    asyncHandler(async (req, res) => {
      const input = schema.parse(req.body);
      const item = await (delegate as any).create({ data: { ...input, userId: req.user!.id } } as any);
      return res.status(201).json({ data: item });
    })
  );
  financeRouter.put(
    `${path}/:id`,
    asyncHandler(async (req, res) => {
      const input = schema.parse(req.body);
      const id = paramUuid(req.params.id);
      const item = await (delegate as any).update({
        where: { id, userId: req.user!.id },
        data: input
      } as any);
      return res.json({ data: item });
    })
  );
  if (path !== "/exchange-rates") financeRouter.delete(`${path}/:id`, archiveRoute(delegate));
}

const zakatSchema = z.object({
  calculationDate: z.coerce.date(),
  yearLabel: z.string().min(2).max(40),
  method: z.string().min(2).max(120).default("Configurable standard method"),
  rate: positiveDecimal.default("0.025"),
  nisabBasis: z.enum(["gold", "silver", "custom"]),
  nisabThreshold: nonNegativeDecimal,
  currency,
  goldSilverPrice: nonNegativeDecimal.optional(),
  priceSource: z.string().max(120).optional(),
  priceDate: z.coerce.date().optional(),
  items: z.array(
    z.object({
      kind: z.enum(["ASSET", "INVESTMENT", "CASH", "RECEIVABLE", "LIABILITY", "EXEMPT", "MANUAL"]),
      sourceEntityId: z.string().optional(),
      label: z.string().min(1).max(160),
      amount: nonNegativeDecimal,
      currency,
      included: z.boolean().default(true),
      eligibilityPct: nonNegativeDecimal.default(100),
      notes: z.string().max(500).optional()
    })
  )
});

financeRouter.post(
  "/zakat/calculations",
  asyncHandler(async (req, res) => {
    const input = zakatSchema.parse(req.body);
    const result = calculateZakat(input);
    const calculation = await prisma.zakatCalculation.create({
      data: {
        userId: req.user!.id,
        calculationDate: input.calculationDate,
        yearLabel: input.yearLabel,
        method: input.method,
        rate: input.rate,
        nisabBasis: input.nisabBasis,
        nisabThreshold: input.nisabThreshold,
        currency: input.currency,
        goldSilverPrice: input.goldSilverPrice,
        priceSource: input.priceSource,
        priceDate: input.priceDate,
        totalZakatableWealth: result.zakatableWealth.toFixed(4),
        thresholdMet: result.thresholdMet,
        estimatedZakatDue: result.estimatedZakat.toFixed(4),
        breakdown: {
          eligibleWealth: result.eligibleWealth.toFixed(4),
          deductibleLiabilities: result.deductibleLiabilities.toFixed(4),
          excluded: result.excluded.toFixed(4)
        },
        items: {
          create: input.items.map((item) => ({ ...item, userId: req.user!.id }))
        }
      },
      include: { items: true }
    });
    return res.status(201).json({ data: calculation });
  })
);

financeRouter.get(
  "/zakat/calculations",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize } = pagination(req.query);
    const where = { userId: req.user!.id, archivedAt: null };
    const [items, total] = await Promise.all([
      prisma.zakatCalculation.findMany({ where, skip, take, orderBy: { calculationDate: "desc" } }),
      prisma.zakatCalculation.count({ where })
    ]);
    return res.json({ data: items, meta: { page, pageSize, total } });
  })
);

financeRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const profile = await prisma.userPreference.findUnique({ where: { userId: req.user!.id } });
    const [expenses, loans, investments, assets, latestZakat] = await Promise.all([
      prisma.expense.findMany({ where: { userId: req.user!.id, archivedAt: null } }),
      prisma.loan.findMany({ where: { userId: req.user!.id, archivedAt: null }, include: { repayments: true } }),
      prisma.investment.findMany({ where: { userId: req.user!.id, archivedAt: null } }),
      prisma.asset.findMany({ where: { userId: req.user!.id, archivedAt: null } }),
      prisma.zakatCalculation.findFirst({ where: { userId: req.user!.id, archivedAt: null }, orderBy: { calculationDate: "desc" } })
    ]);
    const baseCurrency = profile?.baseCurrency ?? "USD";
    const hasMixedCurrency = new Set([
      ...expenses.map((item: { currency: string }) => item.currency),
      ...loans.map((item: { currency: string }) => item.currency),
      ...investments.map((item: { currency: string }) => item.currency),
      ...assets.map((item: { currency: string }) => item.currency)
    ]).size > 1;

    return res.json({
      data: {
        baseCurrency,
        consolidatedTotalsAvailable: !hasMixedCurrency,
        currencyNote: hasMixedCurrency
          ? "Mixed-currency totals require explicit exchange rates before consolidation."
          : "All active records share one currency.",
        counts: {
          expenses: expenses.length,
          loans: loans.length,
          investments: investments.length,
          assets: assets.length
        },
        latestZakat,
        recent: {
          expenses: expenses.slice(0, 5),
          loans: loans.slice(0, 5),
          investments: investments.slice(0, 5),
          assets: assets.slice(0, 5)
        }
      }
    });
  })
);

function csvSafe(value: unknown) {
  const text = String(value ?? "");
  const escaped = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${escaped.replaceAll('"', '""')}"`;
}

financeRouter.get(
  "/exports/:module.csv",
  asyncHandler(async (req, res) => {
    const moduleName = z.enum(["expenses", "loans", "investments", "assets"]).parse(req.params.module);
    const delegate: any = {
      expenses: prisma.expense,
      loans: prisma.loan,
      investments: prisma.investment,
      assets: prisma.asset
    }[moduleName];
    const rows = await delegate.findMany({
      where: { userId: req.user!.id, archivedAt: null },
      orderBy: { createdAt: "desc" }
    });
    const headers = rows[0] ? Object.keys(rows[0]).filter((key) => !["userId"].includes(key)) : ["id"];
    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row: Record<string, unknown>) => headers.map((header) => csvSafe(row[header])).join(","))
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${moduleName}.csv"`);
    return res.send(csv);
  })
);
