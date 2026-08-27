import { Router } from "express";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { groupedAssetCount, linkedAssetValues } from "../services/assets.js";
import { calculateInvestmentValue } from "../services/investments.js";
import { calculateLoanBalance, nextLoanStatus } from "../services/loans.js";
import { calculateZakat } from "../services/zakat.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError, notFound } from "../utils/errors.js";

export const publicFinanceRouter = Router();
export const financeRouter = Router();
financeRouter.use(requireAuth);

const shortId = customAlphabet(
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  5,
);

const currency = z
  .string()
  .length(3)
  .transform((value) => value.toUpperCase());
const positiveDecimal = z
  .union([z.string(), z.number()])
  .refine((value) => Number(value) > 0, {
    message: "Amount must be positive",
  });
const nonNegativeDecimal = z
  .union([z.string(), z.number()])
  .refine((value) => Number(value) >= 0, {
    message: "Amount cannot be negative",
  });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  currency: currency.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().optional(),
});

const csvList = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (Array.isArray(value)) return value;
    return [];
  },
  z.array(z.string().trim().min(1)).default([]),
);

const queryBoolean = z
  .union([z.string(), z.boolean()])
  .default("false")
  .transform((value) => value === true || value === "true" || value === "1");

const stockListQuery = listQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  stockNames: csvList,
  average: queryBoolean,
});

function paramUuid(value: unknown) {
  return z.string().uuid().parse(value);
}

function pagination(query: unknown) {
  const parsed = listQuery.parse(query);
  return {
    ...parsed,
    skip: (parsed.page - 1) * parsed.pageSize,
    take: parsed.pageSize,
  };
}

function stockPagination(query: unknown) {
  const parsed = stockListQuery.parse(query);
  return {
    ...parsed,
    skip: (parsed.page - 1) * parsed.pageSize,
    take: parsed.pageSize,
  };
}

function archiveRoute(delegate: any) {
  return asyncHandler(async (req, res) => {
    const id = paramUuid(req.params.id);
    const result = await delegate.updateMany({
      where: { id, userId: req.user!.id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) throw notFound();
    return res.status(204).send();
  });
}

async function ensureUserCurrencies(userId: string, codes: string[]) {
  const uniqueCodes = [...new Set(codes.map((code) => code.toUpperCase()))];
  const rows = await prisma.userCurrency.findMany({
    where: { userId, currencyCode: { in: uniqueCodes }, active: true },
  });
  const enabled = new Set(rows.map((row) => row.currencyCode));
  const missing = uniqueCodes.filter((code) => !enabled.has(code));

  if (missing.length > 0) {
    throw new ApiError(
      400,
      `Add ${missing.join(", ")} to your currencies before using it.`,
      "CURRENCY_NOT_ENABLED",
      {
        fieldErrors: {
          currency: [`Add ${missing.join(", ")} in settings first.`],
        },
      },
    );
  }
}

const userCurrencySchema = z.object({
  currencyCode: currency,
  isDefault: z.boolean().default(false),
});

financeRouter.get(
  "/currencies",
  asyncHandler(async (_req, res) => {
    const items = await prisma.currency.findMany({
      where: { active: true },
      orderBy: [{ code: "asc" }],
    });
    return res.json({ data: items });
  }),
);

financeRouter.get(
  "/user-currencies",
  asyncHandler(async (req, res) => {
    const items = await prisma.userCurrency.findMany({
      where: { userId: req.user!.id, active: true },
      include: { currency: true },
      orderBy: [{ isDefault: "desc" }, { currencyCode: "asc" }],
    });
    return res.json({ data: items });
  }),
);

financeRouter.post(
  "/user-currencies",
  asyncHandler(async (req, res) => {
    const input = userCurrencySchema.parse(req.body);
    const selectedCurrency = await prisma.currency.findUnique({
      where: { code: input.currencyCode },
    });
    if (!selectedCurrency || !selectedCurrency.active) {
      throw new ApiError(400, "Currency is not available", "CURRENCY_INVALID", {
        fieldErrors: { currencyCode: ["Choose a valid currency."] },
      });
    }

    const activeCount = await prisma.userCurrency.count({
      where: { userId: req.user!.id, active: true },
    });
    const shouldBeDefault = input.isDefault || activeCount === 0;

    const item = await prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.userCurrency.updateMany({
          where: { userId: req.user!.id },
          data: { isDefault: false },
        });
      }

      return tx.userCurrency.upsert({
        where: {
          userId_currencyCode: {
            userId: req.user!.id,
            currencyCode: input.currencyCode,
          },
        },
        create: {
          userId: req.user!.id,
          currencyCode: input.currencyCode,
          active: true,
          isDefault: shouldBeDefault,
        },
        update: {
          active: true,
          isDefault: shouldBeDefault,
        },
        include: { currency: true },
      });
    });

    return res.status(201).json({ data: item });
  }),
);

financeRouter.delete(
  "/user-currencies/:currencyCode",
  asyncHandler(async (req, res) => {
    const currencyCode = currency.parse(req.params.currencyCode);
    const activeCount = await prisma.userCurrency.count({
      where: { userId: req.user!.id, active: true },
    });
    if (activeCount <= 1) {
      throw new ApiError(
        400,
        "Keep at least one currency enabled",
        "LAST_CURRENCY",
        {
          fieldErrors: {
            currencyCode: ["Add another currency before removing this one."],
          },
        },
      );
    }

    const result = await prisma.userCurrency.updateMany({
      where: { userId: req.user!.id, currencyCode, active: true },
      data: { active: false, isDefault: false },
    });
    if (result.count === 0) throw notFound("Currency setting not found");
    return res.status(204).send();
  }),
);

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1).max(40).default("circle"),
  active: z.boolean().default(true),
});

financeRouter.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize, search } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(search
        ? { name: { contains: search, mode: "insensitive" as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.expenseCategory.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
      }),
      prisma.expenseCategory.count({ where }),
    ]);
    return res.json({ data: items, meta: { page, pageSize, total } });
  }),
);

financeRouter.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body);
    const item = await prisma.expenseCategory.create({
      data: { ...input, userId: req.user!.id },
    });
    return res.status(201).json({ data: item });
  }),
);

financeRouter.put(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body);
    const id = paramUuid(req.params.id);
    const item = await prisma.expenseCategory.update({
      where: { id, userId: req.user!.id },
      data: input,
    });
    return res.json({ data: item });
  }),
);

financeRouter.delete("/categories/:id", archiveRoute(prisma.expenseCategory));

const expenseSetupSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(2).max(200),
    mainCurrency: currency,
    currencies: z.array(currency).min(1).max(12),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((input, ctx) => {
    if (!input.currencies.includes(input.mainCurrency)) {
      ctx.addIssue({
        code: "custom",
        path: ["mainCurrency"],
        message: "Main currency must be one of the selected currencies",
      });
    }
  });

const transactionAmountSchema = z.object({
  amount: positiveDecimal,
  currency,
  rateToMain: positiveDecimal.optional(),
});

const base64Image = z.string().min(1).max(8_000_000);
const attachmentSchema = z.object({
  fileName: z.string().max(240).optional(),
  mimeType: z.string().min(3).max(120).default("image/jpeg"),
  dataBase64: base64Image,
  sizeBytes: z.coerce.number().int().min(1).max(140_000),
});

const expenseTransactionSchema = z.object({
  purpose: z.string().trim().min(2).max(200),
  transactionDate: z.coerce.date().default(() => new Date()),
  notes: z.string().max(1000).optional(),
  images: z.array(base64Image).max(5).default([]),
  attachments: z.array(attachmentSchema).max(5).default([]),
  amounts: z.array(transactionAmountSchema).min(1).max(12),
});

const expenseInclude = {
  category: true,
  currencies: {
    include: { currency: true },
    orderBy: [{ isMain: "desc" as const }, { currencyCode: "asc" as const }],
  },
  transactions: {
    where: { archivedAt: null },
    include: {
      amounts: {
        include: { currency: true },
        orderBy: { currencyCode: "asc" as const },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
  amounts: {
    include: { currency: true },
    orderBy: { currencyCode: "asc" as const },
  },
};

function uniqueCurrencies(codes: string[]) {
  return [...new Set(codes.map((code) => code.toUpperCase()))];
}

function normalizedTransactionAmounts(
  input: z.infer<typeof expenseTransactionSchema>,
  mainCurrency: string,
) {
  const mainLine = input.amounts.find((line) => line.currency === mainCurrency);
  const mainAmount = mainLine ? Number(mainLine.amount) : 0;
  if (!mainLine || mainAmount <= 0) {
    throw new ApiError(
      400,
      `Enter the amount in ${mainCurrency}.`,
      "EXPENSE_MAIN_AMOUNT_REQUIRED",
      {
        fieldErrors: {
          amounts: [`Enter the amount in ${mainCurrency}.`],
        },
      },
    );
  }

  const lines = input.amounts.map((line) => {
    const rate =
      line.currency === mainCurrency
        ? 1
        : line.rateToMain
          ? Number(line.rateToMain)
          : 1;
    const amount =
      line.currency === mainCurrency
        ? mainAmount
        : mainAmount > 0 && rate > 0
          ? mainAmount * rate
          : Number(line.amount);
    const inferredRate =
      line.currency === mainCurrency
        ? 1
        : line.rateToMain
          ? Number(line.rateToMain)
          : rate;
    const mainValue = mainAmount;

    return {
      amount: amount.toFixed(4),
      currencyCode: line.currency,
      rateToMain: inferredRate.toFixed(8),
      mainAmount: mainValue.toFixed(4),
    };
  });

  return { lines, total: mainAmount.toFixed(4) };
}

async function refreshExpenseTotal(
  tx: any,
  expenseId: string,
  userId: string,
  mainCurrency: string,
) {
  const aggregate = await tx.expenseTransaction.aggregate({
    where: { userId, expenseId, archivedAt: null },
    _sum: { mainAmount: true },
  });
  await tx.expense.update({
    where: { id: expenseId },
    data: {
      amount: aggregate._sum.mainAmount?.toFixed(4) ?? "0.0000",
      currency: mainCurrency,
    },
  });
}

function legacyImageAttachments(images: string[]) {
  return images.map((image, index) => ({
    fileName: `image-${index + 1}.jpg`,
    mimeType: image.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg",
    dataBase64: image,
    sizeBytes: Math.ceil((image.length * 3) / 4),
  }));
}

function transactionAttachmentInput(input: {
  attachments: z.infer<typeof attachmentSchema>[];
  images: string[];
}) {
  return input.attachments.length
    ? input.attachments
    : legacyImageAttachments(input.images);
}

async function attachFilesToExpenses<
  T extends { transactions?: Array<{ id: string; images?: unknown }> },
>(items: T[]) {
  const transactionIds = items.flatMap(
    (expense) =>
      expense.transactions?.map((transaction) => transaction.id) ?? [],
  );
  if (transactionIds.length === 0) return items;

  const attachments = await prisma.attachment.findMany({
    where: {
      entityType: "EXPENSE_TRANSACTION",
      entityId: { in: transactionIds },
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });
  const byEntity = new Map<string, typeof attachments>();
  attachments.forEach((attachment) => {
    byEntity.set(attachment.entityId, [
      ...(byEntity.get(attachment.entityId) ?? []),
      attachment,
    ]);
  });

  return items.map((expense) => ({
    ...expense,
    transactions: expense.transactions?.map((transaction) => ({
      ...transaction,
      attachments: byEntity.get(transaction.id) ?? [],
      images: Array.isArray(transaction.images) ? transaction.images : [],
    })),
  }));
}

async function attachFilesToLoans<
  T extends { transactions?: Array<{ id: string; images?: unknown }> },
>(items: T[]) {
  const transactionIds = items.flatMap(
    (loan) => loan.transactions?.map((transaction) => transaction.id) ?? [],
  );
  if (transactionIds.length === 0) return items;

  const attachments = await prisma.attachment.findMany({
    where: {
      entityType: "LOAN_TRANSACTION",
      entityId: { in: transactionIds },
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });
  const byEntity = new Map<string, typeof attachments>();
  attachments.forEach((attachment) => {
    byEntity.set(attachment.entityId, [
      ...(byEntity.get(attachment.entityId) ?? []),
      attachment,
    ]);
  });

  return items.map((loan) => ({
    ...loan,
    transactions: loan.transactions?.map((transaction) => ({
      ...transaction,
      attachments: byEntity.get(transaction.id) ?? [],
      images: Array.isArray(transaction.images) ? transaction.images : [],
    })),
  }));
}

financeRouter.get(
  "/expenses",
  asyncHandler(async (req, res) => {
    const {
      skip,
      take,
      page,
      pageSize,
      search,
      currency: requestedCurrency,
      from,
      to,
    } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(requestedCurrency
        ? {
            OR: [
              { currency: requestedCurrency },
              { currencies: { some: { currencyCode: requestedCurrency } } },
            ],
          }
        : {}),
      ...(search
        ? { purpose: { contains: search, mode: "insensitive" as const } }
        : {}),
      ...(from || to ? { expenseDate: { gte: from, lte: to } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take,
        include: expenseInclude,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.expense.count({ where }),
    ]);
    return res.json({
      data: await attachFilesToExpenses(items),
      meta: { page, pageSize, total },
    });
  }),
);

financeRouter.post(
  "/expenses",
  asyncHandler(async (req, res) => {
    const input = expenseSetupSchema.parse(req.body);
    const category = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, userId: req.user!.id, archivedAt: null },
    });
    if (!category)
      throw new ApiError(400, "Category is invalid", "CATEGORY_INVALID");
    const selectedCurrencies = uniqueCurrencies(input.currencies);
    await ensureUserCurrencies(req.user!.id, selectedCurrencies);
    const item = await prisma.expense.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        mainCurrency: input.mainCurrency,
        purpose: input.name,
        amount: "0.0000",
        currency: input.mainCurrency,
        expenseDate: new Date(),
        notes: input.notes,
        userId: req.user!.id,
        currencies: {
          create: selectedCurrencies.map((currencyCode) => ({
            userId: req.user!.id,
            currencyCode,
            isMain: currencyCode === input.mainCurrency,
          })),
        },
      },
      include: expenseInclude,
    });
    return res.status(201).json({ data: item });
  }),
);

financeRouter.get(
  "/expenses/:id",
  asyncHandler(async (req, res) => {
    const id = paramUuid(req.params.id);
    const item = await prisma.expense.findFirst({
      where: { id, userId: req.user!.id, archivedAt: null },
      include: expenseInclude,
    });
    if (!item) throw notFound("Expense not found");
    const [withFiles] = await attachFilesToExpenses([item]);
    return res.json({ data: withFiles });
  }),
);

financeRouter.put(
  "/expenses/:id",
  asyncHandler(async (req, res) => {
    const input = expenseSetupSchema.parse(req.body);
    const id = paramUuid(req.params.id);
    const selectedCurrencies = uniqueCurrencies(input.currencies);
    await ensureUserCurrencies(req.user!.id, selectedCurrencies);
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id, userId: req.user!.id },
        data: {
          categoryId: input.categoryId,
          name: input.name,
          mainCurrency: input.mainCurrency,
          purpose: input.name,
          currency: input.mainCurrency,
          notes: input.notes,
        },
      });
      await tx.expenseCurrency.deleteMany({
        where: { expenseId: updated.id, userId: req.user!.id },
      });
      await tx.expenseCurrency.createMany({
        data: selectedCurrencies.map((currencyCode) => ({
          userId: req.user!.id,
          expenseId: updated.id,
          currencyCode,
          isMain: currencyCode === input.mainCurrency,
        })),
      });
      return tx.expense.findUnique({
        where: { id: updated.id },
        include: expenseInclude,
      });
    });
    return res.json({ data: item });
  }),
);

financeRouter.delete("/expenses/:id", archiveRoute(prisma.expense));

financeRouter.get(
  "/expense-purposes",
  asyncHandler(async (req, res) => {
    const search = z.string().trim().optional().parse(req.query.search);
    const rows = await prisma.expenseTransaction.findMany({
      where: {
        userId: req.user!.id,
        archivedAt: null,
        ...(search ? { purpose: { contains: search } } : {}),
      },
      distinct: ["purpose"],
      select: { purpose: true },
      orderBy: { purpose: "asc" },
      take: 25,
    });
    return res.json({ data: rows.map((row) => row.purpose) });
  }),
);

financeRouter.post(
  "/expenses/:expenseId/transactions",
  asyncHandler(async (req, res) => {
    const expenseId = paramUuid(req.params.expenseId);
    const input = expenseTransactionSchema.parse(req.body);
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId: req.user!.id, archivedAt: null },
      include: { currencies: true },
    });
    if (!expense) throw notFound("Expense not found");

    const allowedCurrencies = new Set(
      (expense.currencies.length
        ? expense.currencies.map((item) => item.currencyCode)
        : [expense.currency]
      ).map((code) => code.toUpperCase()),
    );
    const requestedCurrencies = uniqueCurrencies(
      input.amounts.map((line) => line.currency),
    );
    const invalidCurrencies = requestedCurrencies.filter(
      (code) => !allowedCurrencies.has(code),
    );
    if (invalidCurrencies.length > 0) {
      throw new ApiError(
        400,
        `${invalidCurrencies.join(", ")} is not enabled for this expense.`,
        "EXPENSE_CURRENCY_INVALID",
        {
          fieldErrors: {
            amounts: ["Use only currencies selected on this expense."],
          },
        },
      );
    }

    const mainCurrency = expense.mainCurrency ?? expense.currency;
    const normalized = normalizedTransactionAmounts(input, mainCurrency);
    const attachments = transactionAttachmentInput(input);
    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.expenseTransaction.create({
        data: {
          userId: req.user!.id,
          expenseId: expense.id,
          purpose: input.purpose,
          transactionDate: input.transactionDate,
          mainCurrency,
          mainAmount: normalized.total,
          notes: input.notes,
          amounts: {
            create: normalized.lines.map((line) => ({
              userId: req.user!.id,
              ...line,
            })),
          },
        },
        include: {
          amounts: {
            include: { currency: true },
            orderBy: { currencyCode: "asc" },
          },
        },
      });
      if (attachments.length > 0) {
        await tx.attachment.createMany({
          data: attachments.map((attachment) => ({
            userId: req.user!.id,
            entityType: "EXPENSE_TRANSACTION",
            entityId: created.id,
            ...attachment,
          })),
        });
      }
      await refreshExpenseTotal(tx, expense.id, req.user!.id, mainCurrency);
      return created;
    });

    const transactionWithFiles = (
      await attachFilesToExpenses([{ transactions: [transaction] }])
    )[0]?.transactions?.[0];
    return res.status(201).json({ data: transactionWithFiles ?? transaction });
  }),
);

financeRouter.put(
  "/expenses/:expenseId/transactions/:transactionId",
  asyncHandler(async (req, res) => {
    const expenseId = paramUuid(req.params.expenseId);
    const transactionId = paramUuid(req.params.transactionId);
    const input = expenseTransactionSchema.parse(req.body);
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId: req.user!.id, archivedAt: null },
      include: { currencies: true },
    });
    if (!expense) throw notFound("Expense not found");

    const allowedCurrencies = new Set(
      (expense.currencies.length
        ? expense.currencies.map((item) => item.currencyCode)
        : [expense.currency]
      ).map((code) => code.toUpperCase()),
    );
    const requestedCurrencies = uniqueCurrencies(
      input.amounts.map((line) => line.currency),
    );
    const invalidCurrencies = requestedCurrencies.filter(
      (code) => !allowedCurrencies.has(code),
    );
    if (invalidCurrencies.length > 0) {
      throw new ApiError(
        400,
        `${invalidCurrencies.join(", ")} is not enabled for this expense.`,
        "EXPENSE_CURRENCY_INVALID",
        {
          fieldErrors: {
            amounts: ["Use only currencies selected on this expense."],
          },
        },
      );
    }

    const mainCurrency = expense.mainCurrency ?? expense.currency;
    const normalized = normalizedTransactionAmounts(input, mainCurrency);
    const attachments = transactionAttachmentInput(input);
    const transaction = await prisma.$transaction(async (tx) => {
      const updated = await tx.expenseTransaction.update({
        where: { id: transactionId, userId: req.user!.id },
        data: {
          purpose: input.purpose,
          transactionDate: input.transactionDate,
          mainCurrency,
          mainAmount: normalized.total,
          notes: input.notes,
        },
      });
      await tx.expenseTransactionAmount.deleteMany({
        where: { transactionId: updated.id, userId: req.user!.id },
      });
      await tx.expenseTransactionAmount.createMany({
        data: normalized.lines.map((line) => ({
          userId: req.user!.id,
          transactionId: updated.id,
          ...line,
        })),
      });
      await tx.attachment.updateMany({
        where: {
          userId: req.user!.id,
          entityType: "EXPENSE_TRANSACTION",
          entityId: updated.id,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      if (attachments.length > 0) {
        await tx.attachment.createMany({
          data: attachments.map((attachment) => ({
            userId: req.user!.id,
            entityType: "EXPENSE_TRANSACTION",
            entityId: updated.id,
            ...attachment,
          })),
        });
      }
      await refreshExpenseTotal(tx, expense.id, req.user!.id, mainCurrency);
      return tx.expenseTransaction.findUnique({
        where: { id: updated.id },
        include: {
          amounts: {
            include: { currency: true },
            orderBy: { currencyCode: "asc" },
          },
        },
      });
    });

    const transactionWithFiles = (
      await attachFilesToExpenses([
        { transactions: transaction ? [transaction] : [] },
      ])
    )[0]?.transactions?.[0];
    return res.json({ data: transactionWithFiles ?? transaction });
  }),
);

financeRouter.delete(
  "/expenses/:expenseId/transactions/:transactionId",
  asyncHandler(async (req, res) => {
    const expenseId = paramUuid(req.params.expenseId);
    const transactionId = paramUuid(req.params.transactionId);
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId: req.user!.id, archivedAt: null },
    });
    if (!expense) throw notFound("Expense not found");

    await prisma.$transaction(async (tx) => {
      const result = await tx.expenseTransaction.updateMany({
        where: {
          id: transactionId,
          expenseId,
          userId: req.user!.id,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      if (result.count === 0) throw notFound("Transaction not found");
      await tx.attachment.updateMany({
        where: {
          userId: req.user!.id,
          entityType: "EXPENSE_TRANSACTION",
          entityId: transactionId,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      await refreshExpenseTotal(
        tx,
        expense.id,
        req.user!.id,
        expense.mainCurrency ?? expense.currency,
      );
    });

    return res.status(204).send();
  }),
);

const loanSchema = z.object({
  id: z.string().uuid().optional(),
  shareId: z.string().length(5).optional(),
  person: z.string().trim().min(2).max(120),
  pinnedAt: z.coerce.date().nullable().optional(),
});

const loanTransactionSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["CREDIT", "DEBIT"]),
  purpose: z.string().trim().min(2).max(200),
  currency,
  amount: positiveDecimal,
  transactionDate: z.coerce.date().default(() => new Date()),
  notes: z.string().max(1000).optional(),
  images: z.array(base64Image).max(5).default([]),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

const loanInclude = {
  transactions: {
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" as const },
  },
  repayments: {
    where: { archivedAt: null },
    orderBy: { paymentDate: "desc" as const },
  },
};

type LoanWithTransactions = {
  amount: unknown;
  currency: string;
  direction: string;
  transactions?: Array<{
    amount: unknown;
    currency: string;
    kind: string;
    archivedAt?: Date | null;
  }>;
};

function loanBalances(loan: LoanWithTransactions) {
  const balances = new Map<string, number>();
  const activeTransactions =
    loan.transactions?.filter((transaction) => !transaction.archivedAt) ?? [];

  if (activeTransactions.length === 0 && Number(loan.amount) > 0) {
    const sign = loan.direction === "BORROWED" ? -1 : 1;
    balances.set(loan.currency, Number(loan.amount) * sign);
  }

  activeTransactions.forEach((transaction) => {
    const sign = transaction.kind === "DEBIT" ? -1 : 1;
    balances.set(
      transaction.currency,
      (balances.get(transaction.currency) ?? 0) +
        Number(transaction.amount) * sign,
    );
  });

  return [...balances.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, balance]) => ({
      currency: currencyCode,
      balance: balance.toFixed(4),
    }));
}

function withLoanBalances<T extends LoanWithTransactions>(loan: T) {
  return { ...loan, balances: loanBalances(loan) };
}

async function createLoanShareId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shareId = shortId();
    const existing = await prisma.loan.findUnique({ where: { shareId } });
    if (!existing) return shareId;
  }
  throw new ApiError(500, "Could not create a share id", "SHARE_ID_FAILED");
}

async function ensureLoanShareId(shareId?: string) {
  if (!shareId) return createLoanShareId();
  const existing = await prisma.loan.findUnique({ where: { shareId } });
  if (existing) return createLoanShareId();
  return shareId;
}

publicFinanceRouter.get(
  "/public/loans/:shareId",
  asyncHandler(async (req, res) => {
    const shareId = z.string().trim().length(5).parse(req.params.shareId);
    const item = await prisma.loan.findFirst({
      where: { shareId, archivedAt: null },
      select: {
        id: true,
        shareId: true,
        person: true,
        amount: true,
        currency: true,
        direction: true,
        loanDate: true,
        updatedAt: true,
        transactions: {
          where: { archivedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            purpose: true,
            amount: true,
            currency: true,
            transactionDate: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!item) throw notFound("Loan not found");
    return res.json({ data: withLoanBalances(item) });
  }),
);

financeRouter.get(
  "/loans",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize, search } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(search
        ? { person: { contains: search, mode: "insensitive" as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip,
        take,
        include: loanInclude,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.loan.count({ where }),
    ]);
    const itemsWithFiles = await attachFilesToLoans(items);
    return res.json({
      data: itemsWithFiles.map(withLoanBalances),
      meta: { page, pageSize, total },
    });
  }),
);

financeRouter.post(
  "/loans",
  asyncHandler(async (req, res) => {
    const input = loanSchema.parse(req.body);
    if (input.id) {
      const existing = await prisma.loan.findFirst({
        where: { id: input.id, userId: req.user!.id, archivedAt: null },
        include: loanInclude,
      });
      if (existing)
        return res.status(200).json({ data: withLoanBalances(existing) });
    }
    const defaultCurrency = await prisma.userCurrency.findFirst({
      where: { userId: req.user!.id, active: true },
      orderBy: [{ isDefault: "desc" }, { currencyCode: "asc" }],
    });
    const item = await prisma.loan.create({
      data: {
        userId: req.user!.id,
        ...(input.id ? { id: input.id } : {}),
        shareId: await ensureLoanShareId(input.shareId),
        person: input.person,
        purpose: input.person,
        amount: "0.0000",
        currency: defaultCurrency?.currencyCode ?? "USD",
        direction: "LENT",
        ...(input.pinnedAt !== undefined ? { pinnedAt: input.pinnedAt } : {}),
      },
      include: loanInclude,
    });
    const [itemWithFiles] = await attachFilesToLoans([item]);
    return res
      .status(201)
      .json({ data: withLoanBalances(itemWithFiles ?? item) });
  }),
);

financeRouter.put(
  "/loans/:id",
  asyncHandler(async (req, res) => {
    const input = loanSchema.parse(req.body);
    const id = paramUuid(req.params.id);
    const item = await prisma.loan.update({
      where: { id, userId: req.user!.id },
      data: {
        person: input.person,
        purpose: input.person,
        ...(input.pinnedAt !== undefined ? { pinnedAt: input.pinnedAt } : {}),
      },
      include: loanInclude,
    });
    const [itemWithFiles] = await attachFilesToLoans([item]);
    return res.json({ data: withLoanBalances(itemWithFiles ?? item) });
  }),
);

financeRouter.delete("/loans/:id", archiveRoute(prisma.loan));

financeRouter.get(
  "/loans/share/:shareId",
  asyncHandler(async (req, res) => {
    const shareId = z.string().trim().length(5).parse(req.params.shareId);
    const item = await prisma.loan.findFirst({
      where: { shareId, userId: req.user!.id, archivedAt: null },
      include: loanInclude,
    });
    if (!item) throw notFound("Loan not found");
    const [itemWithFiles] = await attachFilesToLoans([item]);
    return res.json({ data: withLoanBalances(itemWithFiles ?? item) });
  }),
);

financeRouter.get(
  "/loans/:id",
  asyncHandler(async (req, res) => {
    const id = paramUuid(req.params.id);
    const item = await prisma.loan.findFirst({
      where: { id, userId: req.user!.id, archivedAt: null },
      include: loanInclude,
    });
    if (!item) throw notFound("Loan not found");
    const [itemWithFiles] = await attachFilesToLoans([item]);
    return res.json({ data: withLoanBalances(itemWithFiles ?? item) });
  }),
);

financeRouter.get(
  "/loan-purposes",
  asyncHandler(async (req, res) => {
    const search = z.string().trim().optional().parse(req.query.search);
    const rows = await prisma.loanTransaction.findMany({
      where: {
        userId: req.user!.id,
        archivedAt: null,
        ...(search ? { purpose: { contains: search } } : {}),
      },
      distinct: ["purpose"],
      select: { purpose: true },
      orderBy: { purpose: "asc" },
      take: 25,
    });
    return res.json({ data: rows.map((row) => row.purpose) });
  }),
);

financeRouter.post(
  "/loans/:loanId/transactions",
  asyncHandler(async (req, res) => {
    const loanId = paramUuid(req.params.loanId);
    const input = loanTransactionSchema.parse(req.body);
    if (input.id) {
      const existing = await prisma.loanTransaction.findFirst({
        where: { id: input.id, userId: req.user!.id, archivedAt: null },
      });
      if (existing) return res.status(200).json({ data: existing });
    }
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, userId: req.user!.id, archivedAt: null },
    });
    if (!loan) throw notFound("Loan not found");
    await ensureUserCurrencies(req.user!.id, [input.currency]);
    const attachments = transactionAttachmentInput(input);

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.loanTransaction.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          userId: req.user!.id,
          loanId: loan.id,
          kind: input.kind,
          purpose: input.purpose,
          currency: input.currency,
          amount: Number(input.amount).toFixed(4),
          transactionDate: input.transactionDate,
          notes: input.notes,
        },
      });
      if (attachments.length > 0) {
        await tx.attachment.createMany({
          data: attachments.map((attachment) => ({
            userId: req.user!.id,
            entityType: "LOAN_TRANSACTION",
            entityId: created.id,
            ...attachment,
          })),
        });
      }
      await tx.loan.update({
        where: { id: loan.id },
        data: { updatedAt: new Date() },
      });
      return created;
    });
    const itemWithFiles = (
      await attachFilesToLoans([{ transactions: [item] }])
    )[0]?.transactions?.[0];
    return res.status(201).json({ data: itemWithFiles ?? item });
  }),
);

financeRouter.put(
  "/loans/:loanId/transactions/:transactionId",
  asyncHandler(async (req, res) => {
    const loanId = paramUuid(req.params.loanId);
    const transactionId = paramUuid(req.params.transactionId);
    const input = loanTransactionSchema.parse(req.body);
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, userId: req.user!.id, archivedAt: null },
    });
    if (!loan) throw notFound("Loan not found");
    await ensureUserCurrencies(req.user!.id, [input.currency]);
    const attachments = transactionAttachmentInput(input);

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.loanTransaction.update({
        where: { id: transactionId, loanId, userId: req.user!.id },
        data: {
          kind: input.kind,
          purpose: input.purpose,
          currency: input.currency,
          amount: Number(input.amount).toFixed(4),
          transactionDate: input.transactionDate,
          notes: input.notes,
        },
      });
      await tx.attachment.updateMany({
        where: {
          userId: req.user!.id,
          entityType: "LOAN_TRANSACTION",
          entityId: updated.id,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      if (attachments.length > 0) {
        await tx.attachment.createMany({
          data: attachments.map((attachment) => ({
            userId: req.user!.id,
            entityType: "LOAN_TRANSACTION",
            entityId: updated.id,
            ...attachment,
          })),
        });
      }
      await tx.loan.update({
        where: { id: loan.id },
        data: { updatedAt: new Date() },
      });
      return updated;
    });
    const itemWithFiles = (
      await attachFilesToLoans([{ transactions: [item] }])
    )[0]?.transactions?.[0];
    return res.json({ data: itemWithFiles ?? item });
  }),
);

financeRouter.delete(
  "/loans/:loanId/transactions/:transactionId",
  asyncHandler(async (req, res) => {
    const loanId = paramUuid(req.params.loanId);
    const transactionId = paramUuid(req.params.transactionId);
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, userId: req.user!.id, archivedAt: null },
    });
    if (!loan) throw notFound("Loan not found");

    await prisma.$transaction(async (tx) => {
      const result = await tx.loanTransaction.updateMany({
        where: {
          id: transactionId,
          loanId,
          userId: req.user!.id,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      if (result.count === 0) throw notFound("Transaction not found");
      await tx.attachment.updateMany({
        where: {
          userId: req.user!.id,
          entityType: "LOAN_TRANSACTION",
          entityId: transactionId,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      await tx.loan.update({
        where: { id: loan.id },
        data: { updatedAt: new Date() },
      });
    });

    return res.status(204).send();
  }),
);

const repaymentSchema = z.object({
  amount: positiveDecimal,
  currency,
  paymentDate: z.coerce.date().default(() => new Date()),
  notes: z.string().max(1000).optional(),
  adjustment: z.boolean().default(false),
});

financeRouter.post(
  "/loans/:loanId/repayments",
  asyncHandler(async (req, res) => {
    const input = repaymentSchema.parse(req.body);
    const loanId = paramUuid(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, userId: req.user!.id, archivedAt: null },
    });
    if (!loan) throw notFound("Loan not found");
    const activeRepayments = await prisma.loanRepayment.findMany({
      where: { loanId: loan.id, userId: req.user!.id, archivedAt: null },
    });
    const balance = calculateLoanBalance(
      loan.amount.toString(),
      loan.currency,
      activeRepayments,
    );
    if (
      !input.adjustment &&
      Number(input.amount) > balance.remaining.toNumber()
    ) {
      throw new ApiError(
        400,
        "Repayment exceeds remaining balance",
        "REPAYMENT_EXCEEDS_BALANCE",
      );
    }
    const repayment = await prisma.loanRepayment.create({
      data: { ...input, loanId: loan.id, userId: req.user!.id },
    });
    const repayments = [...activeRepayments, repayment];
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        status: nextLoanStatus(
          loan.amount.toString(),
          loan.currency,
          repayments,
          loan.dueDate,
        ),
      },
    });
    return res.status(201).json({ data: repayment });
  }),
);

const investmentSchema = z.object({
  type: z.string().trim().min(2).max(80),
  name: z.string().trim().max(120).optional(),
  stockFundName: z.string().trim().max(191).nullable().optional(),
  amountInvested: positiveDecimal,
  currency,
  quantity: nonNegativeDecimal.optional(),
  nav: nonNegativeDecimal.optional(),
  currentValue: nonNegativeDecimal.optional(),
  purchaseDate: z.coerce.date().optional(),
  latestValuationDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  zakatEligible: z.boolean().default(false),
  zakatPercentage: nonNegativeDecimal.default(100),
});

function investmentPurchaseTime(investment: {
  purchaseDate?: Date | null;
  createdAt?: Date | null;
}) {
  return Math.max(
    investment.purchaseDate?.getTime() ?? 0,
    investment.createdAt?.getTime() ?? 0,
  );
}

financeRouter.get(
  "/investments",
  asyncHandler(async (req, res) => {
    const {
      skip,
      take,
      page,
      pageSize,
      search,
      currency: requestedCurrency,
    } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(requestedCurrency ? { currency: requestedCurrency } : {}),
      ...(search
        ? { name: { contains: search, mode: "insensitive" as const } }
        : {}),
    };
    const [allItems, total] = await Promise.all([
      prisma.investment.findMany({
        where,
        orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.investment.count({ where }),
    ]);
    const items = allItems
      .sort(
        (left, right) =>
          investmentPurchaseTime(right) - investmentPurchaseTime(left),
      )
      .slice(skip, skip + take);
    return res.json({ data: items, meta: { page, pageSize, total } });
  }),
);

financeRouter.post(
  "/investments",
  asyncHandler(async (req, res) => {
    const input = investmentSchema.parse(req.body);
    const item = await prisma.investment.create({
      data: { ...input, userId: req.user!.id },
    });
    return res.status(201).json({
      data: item,
      calculations: calculateInvestmentValue(item as any),
    });
  }),
);

financeRouter.put(
  "/investments/:id",
  asyncHandler(async (req, res) => {
    const input = investmentSchema.parse(req.body);
    const id = paramUuid(req.params.id);
    const item = await prisma.investment.update({
      where: { id, userId: req.user!.id },
      data: input,
    });
    return res.json({
      data: item,
      calculations: calculateInvestmentValue(item as any),
    });
  }),
);

financeRouter.delete("/investments/:id", archiveRoute(prisma.investment));

const stockAverageFields = [
  "repurchasePrice",
  "offerPrice",
  "navPrice",
  "managementFee",
  "trusteeFee",
  "regulatoryFee",
  "leviesAndTaxes",
  "transactionExpenses",
  "thirdPartyExpenses",
  "otherExpenses",
  "terWithLevies",
  "terWithoutLevies",
  "mtdReturn",
  "fytdReturn",
  "cytdReturn",
  "fy25Return",
  "fy24Return",
  "sinceInceptionReturn",
] as const;

const stockTrendFields = ["repurchasePrice", "navPrice", "offerPrice"] as const;

function averageStockValue(
  rows: Array<Record<string, any>>,
  key: (typeof stockAverageFields)[number],
) {
  const values = rows
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return (
    values.reduce((sum, value) => sum + value, 0) / values.length
  ).toFixed(4);
}

function averageStockRows(rows: Array<Record<string, any>>) {
  const groups = new Map<string, Array<Record<string, any>>>();
  rows.forEach((row) => {
    groups.set(row.fundName, [...(groups.get(row.fundName) ?? []), row]);
  });

  return [...groups.entries()].map(([fundName, group]) => {
    const latest = [...group].sort(
      (left, right) =>
        new Date(right.validityDate).getTime() -
        new Date(left.validityDate).getTime(),
    )[0]!;
    const averaged = Object.fromEntries(
      stockAverageFields.map((field) => [
        field,
        averageStockValue(group, field),
      ]),
    );

    return {
      ...latest,
      ...averaged,
      id: `average:${fundName}`,
      fundName,
      validityDate: latest.validityDate,
      isAverage: true,
      recordCount: group.length,
    };
  });
}

function stockTrendFor(
  item: Record<string, any>,
  historicalRows: Array<Record<string, any>>,
) {
  const previous = historicalRows.find(
    (row) =>
      row.fundName === item.fundName &&
      new Date(row.validityDate).getTime() <
        new Date(item.validityDate).getTime(),
  );

  if (!previous) {
    return {
      direction: null,
      basis: null,
      latestValue: null,
      previousValue: null,
      previousValidityDate: null,
      change: null,
      changePercent: null,
    };
  }

  for (const field of stockTrendFields) {
    const latestValue = Number(item[field]);
    const previousValue = Number(previous[field]);

    if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue)) {
      continue;
    }

    const change = latestValue - previousValue;
    return {
      direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
      basis: field,
      latestValue: latestValue.toFixed(4),
      previousValue: previousValue.toFixed(4),
      previousValidityDate: previous.validityDate,
      change: change.toFixed(4),
      changePercent:
        previousValue === 0
          ? null
          : ((change / previousValue) * 100).toFixed(2),
    };
  }

  return {
    direction: null,
    basis: null,
    latestValue: null,
    previousValue: null,
    previousValidityDate: previous.validityDate,
    change: null,
    changePercent: null,
  };
}

async function stockRowsWithUserState(
  rows: Array<Record<string, any>>,
  userId: string,
) {
  const fundNames = [...new Set(rows.map((row) => row.fundName))];
  if (fundNames.length === 0) return rows;

  const [favorites, trendRows] = await Promise.all([
    prisma.stockFavorite.findMany({
      where: { userId, fundName: { in: fundNames } },
      select: { fundName: true },
    }),
    prisma.stock.findMany({
      where: { fundName: { in: fundNames } },
      select: {
        fundName: true,
        validityDate: true,
        repurchasePrice: true,
        navPrice: true,
        offerPrice: true,
      },
      orderBy: [{ fundName: "asc" }, { validityDate: "desc" }],
    }),
  ]);
  const favoriteNames = new Set(favorites.map((favorite) => favorite.fundName));

  return rows.map((row) => ({
    ...row,
    isFavorite: favoriteNames.has(row.fundName),
    trend: stockTrendFor(row, trendRows),
  }));
}

financeRouter.get(
  "/stocks",
  asyncHandler(async (req, res) => {
    const {
      skip,
      take,
      page,
      pageSize,
      search,
      from,
      to,
      stockNames,
      average,
    } = stockPagination(req.query);
    const latestStock =
      !from && !to
        ? await prisma.stock.findFirst({
            select: { validityDate: true },
            orderBy: { validityDate: "desc" },
          })
        : null;
    const where: any = {
      ...(search
        ? {
            OR: [
              { fundName: { contains: search } },
              { category: { contains: search } },
            ],
          }
        : {}),
      ...(stockNames.length > 0 ? { fundName: { in: stockNames } } : {}),
      ...(from || to
        ? { validityDate: { gte: from, lte: to } }
        : latestStock
          ? { validityDate: latestStock.validityDate }
          : {}),
    };

    if (average) {
      const rows = await prisma.stock.findMany({
        where,
        orderBy: [{ fundName: "asc" }, { validityDate: "desc" }],
      });
      const items = averageStockRows(rows);
      return res.json({
        data: await stockRowsWithUserState(
          items.slice(skip, skip + take),
          req.user!.id,
        ),
        meta: {
          page,
          pageSize,
          total: items.length,
          average: true,
          latestValidityDate: latestStock?.validityDate ?? null,
        },
      });
    }

    const [items, total] = await Promise.all([
      prisma.stock.findMany({
        where,
        skip,
        take,
        orderBy: [{ validityDate: "desc" }, { fundName: "asc" }],
      }),
      prisma.stock.count({ where }),
    ]);
    return res.json({
      data: await stockRowsWithUserState(items, req.user!.id),
      meta: {
        page,
        pageSize,
        total,
        latestValidityDate: latestStock?.validityDate ?? null,
      },
    });
  }),
);

const stockFavoriteSchema = z.object({
  fundName: z.string().trim().min(1).max(191),
  favorite: z.boolean(),
});

financeRouter.put(
  "/stocks/favorites",
  asyncHandler(async (req, res) => {
    const input = stockFavoriteSchema.parse(req.body);
    const stock = await prisma.stock.findFirst({
      where: { fundName: input.fundName },
      select: { fundName: true },
    });

    if (!stock) throw notFound("Stock not found");

    if (input.favorite) {
      await prisma.stockFavorite.upsert({
        where: {
          userId_fundName: {
            userId: req.user!.id,
            fundName: input.fundName,
          },
        },
        create: { userId: req.user!.id, fundName: input.fundName },
        update: {},
      });
    } else {
      await prisma.stockFavorite.deleteMany({
        where: { userId: req.user!.id, fundName: input.fundName },
      });
    }

    return res.json({
      data: { fundName: input.fundName, isFavorite: input.favorite },
    });
  }),
);

financeRouter.get(
  "/stocks/options",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.stock.findMany({
      distinct: ["fundName"],
      select: { fundName: true, category: true },
      orderBy: { fundName: "asc" },
    });
    return res.json({ data: rows });
  }),
);

financeRouter.get(
  "/stocks/:id",
  asyncHandler(async (req, res) => {
    const id = paramUuid(req.params.id);
    const item = await prisma.stock.findUnique({ where: { id } });
    if (!item) throw notFound("Stock record not found");
    return res.json({ data: item });
  }),
);

const assetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  assetType: z.string().trim().min(2).max(80).default("Other"),
  value: nonNegativeDecimal,
  currency,
  sourceExpenseId: z.string().uuid().optional(),
  sourceCurrency: currency.optional(),
  acquisitionDate: z.coerce.date().optional(),
  valuationDate: z.coerce.date().optional(),
  zakatEligible: z.boolean().default(false),
  zakatPercentage: nonNegativeDecimal.default(100),
  notes: z.string().max(1000).optional(),
});

financeRouter.get(
  "/assets",
  asyncHandler(async (req, res) => {
    const {
      skip,
      take,
      page,
      pageSize,
      currency: requestedCurrency,
    } = pagination(req.query);
    const where = {
      userId: req.user!.id,
      archivedAt: null,
      ...(requestedCurrency ? { currency: requestedCurrency } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.asset.count({ where }),
    ]);
    return res.json({
      data: await linkedAssetValues(items, req.user!.id),
      meta: { page, pageSize, total },
    });
  }),
);

financeRouter.post(
  "/assets",
  asyncHandler(async (req, res) => {
    const input = assetSchema.parse(req.body);
    if (input.sourceExpenseId) {
      const expense = await prisma.expense.findFirst({
        where: {
          id: input.sourceExpenseId,
          userId: req.user!.id,
          archivedAt: null,
        },
      });
      if (!expense) throw notFound("Expense not found");
    }
    const data = {
      ...input,
      sourceCurrency: input.sourceCurrency ?? input.currency,
      userId: req.user!.id,
    };
    const item = input.sourceExpenseId
      ? await prisma.asset.upsert({
          where: {
            userId_sourceExpenseId_currency: {
              userId: req.user!.id,
              sourceExpenseId: input.sourceExpenseId,
              currency: input.currency,
            },
          },
          create: data,
          update: {
            ...input,
            sourceCurrency: input.sourceCurrency ?? input.currency,
            archivedAt: null,
          },
        })
      : await prisma.asset.create({ data });
    const [linkedItem] = await linkedAssetValues([item], req.user!.id);
    return res.status(201).json({ data: linkedItem ?? item });
  }),
);

financeRouter.put(
  "/assets/:id",
  asyncHandler(async (req, res) => {
    const input = assetSchema.parse(req.body);
    const id = paramUuid(req.params.id);
    if (input.sourceExpenseId) {
      const expense = await prisma.expense.findFirst({
        where: {
          id: input.sourceExpenseId,
          userId: req.user!.id,
          archivedAt: null,
        },
      });
      if (!expense) throw notFound("Expense not found");
    }
    const item = await prisma.asset.update({
      where: { id, userId: req.user!.id },
      data: {
        ...input,
        sourceCurrency: input.sourceCurrency ?? input.currency,
      },
    });
    const [linkedItem] = await linkedAssetValues([item], req.user!.id);
    return res.json({ data: linkedItem ?? item });
  }),
);

financeRouter.delete(
  "/assets/:id",
  asyncHandler(async (req, res) => {
    const id = paramUuid(req.params.id);
    const asset = await prisma.asset.findFirst({
      where: { id, userId: req.user!.id, archivedAt: null },
    });
    if (!asset) throw notFound();

    if (asset.sourceExpenseId) {
      await prisma.asset.updateMany({
        where: {
          userId: req.user!.id,
          sourceExpenseId: asset.sourceExpenseId,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      return res.status(204).send();
    }

    await prisma.asset.update({
      where: { id, userId: req.user!.id },
      data: { archivedAt: new Date() },
    });
    return res.status(204).send();
  }),
);

for (const [path, delegate, schema, orderBy] of [
  [
    "/exchange-rates",
    prisma.exchangeRate,
    z.object({
      baseCurrency: currency,
      quoteCurrency: currency,
      rate: positiveDecimal,
      source: z.string().min(2).max(120),
      rateDate: z.coerce.date(),
    }),
    { rateDate: "desc" },
  ],
] as const) {
  financeRouter.get(
    path,
    asyncHandler(async (req, res) => {
      const { skip, take, page, pageSize } = pagination(req.query);
      const where = {
        userId: req.user!.id,
      };
      const [items, total] = await Promise.all([
        (delegate as any).findMany({ where, skip, take, orderBy } as any),
        (delegate as any).count({ where } as any),
      ]);
      return res.json({ data: items, meta: { page, pageSize, total } });
    }),
  );
  financeRouter.post(
    path,
    asyncHandler(async (req, res) => {
      const input = schema.parse(req.body);
      const item = await (delegate as any).create({
        data: { ...input, userId: req.user!.id },
      } as any);
      return res.status(201).json({ data: item });
    }),
  );
  financeRouter.put(
    `${path}/:id`,
    asyncHandler(async (req, res) => {
      const input = schema.parse(req.body);
      const id = paramUuid(req.params.id);
      const item = await (delegate as any).update({
        where: { id, userId: req.user!.id },
        data: input,
      } as any);
      return res.json({ data: item });
    }),
  );
  if (path !== "/exchange-rates")
    financeRouter.delete(`${path}/:id`, archiveRoute(delegate));
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
      kind: z.enum([
        "ASSET",
        "INVESTMENT",
        "CASH",
        "RECEIVABLE",
        "LIABILITY",
        "EXEMPT",
        "MANUAL",
      ]),
      sourceEntityId: z.string().optional(),
      label: z.string().min(1).max(160),
      amount: nonNegativeDecimal,
      currency,
      included: z.boolean().default(true),
      eligibilityPct: nonNegativeDecimal.default(100),
      notes: z.string().max(500).optional(),
    }),
  ),
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
          excluded: result.excluded.toFixed(4),
        },
        items: {
          create: input.items.map((item) => ({
            ...item,
            userId: req.user!.id,
          })),
        },
      },
      include: { items: true },
    });
    return res.status(201).json({ data: calculation });
  }),
);

financeRouter.get(
  "/zakat/calculations",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize } = pagination(req.query);
    const where = { userId: req.user!.id, archivedAt: null };
    const [items, total] = await Promise.all([
      prisma.zakatCalculation.findMany({
        where,
        skip,
        take,
        orderBy: { calculationDate: "desc" },
      }),
      prisma.zakatCalculation.count({ where }),
    ]);
    return res.json({ data: items, meta: { page, pageSize, total } });
  }),
);

financeRouter.delete(
  "/zakat/calculations/:id",
  archiveRoute(prisma.zakatCalculation),
);

const trashType = z.enum([
  "loans",
  "loan-transactions",
  "expenses",
  "expense-transactions",
  "investments",
  "assets",
  "categories",
  "zakat-calculations",
]);

type TrashType = z.infer<typeof trashType>;

const trashConfig: Record<
  TrashType,
  { label: string; delegate: any; title: (item: any) => string }
> = {
  loans: { label: "Loan", delegate: prisma.loan, title: (item) => item.person },
  "loan-transactions": {
    label: "Loan transaction",
    delegate: prisma.loanTransaction,
    title: (item) => `${item.purpose} - ${item.loan?.person ?? item.currency}`,
  },
  expenses: {
    label: "Expense",
    delegate: prisma.expense,
    title: (item) => item.name ?? item.purpose,
  },
  "expense-transactions": {
    label: "Expense transaction",
    delegate: prisma.expenseTransaction,
    title: (item) =>
      `${item.purpose} - ${item.expense?.name ?? item.mainCurrency}`,
  },
  investments: {
    label: "Investment",
    delegate: prisma.investment,
    title: (item) => item.name ?? item.type,
  },
  assets: {
    label: "Asset",
    delegate: prisma.asset,
    title: (item) => item.name,
  },
  categories: {
    label: "Category",
    delegate: prisma.expenseCategory,
    title: (item) => item.name,
  },
  "zakat-calculations": {
    label: "Zakat calculation",
    delegate: prisma.zakatCalculation,
    title: (item) => item.yearLabel,
  },
};

function trashItem(type: TrashType, item: any) {
  const config = trashConfig[type];
  return {
    id: item.id,
    type,
    label: config.label,
    title: config.title(item),
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function findArchivedTrashItem(
  type: TrashType,
  id: string,
  userId: string,
) {
  const include =
    type === "loan-transactions"
      ? { loan: { select: { person: true } } }
      : type === "expense-transactions"
        ? {
            expense: {
              select: {
                id: true,
                name: true,
                mainCurrency: true,
                currency: true,
              },
            },
          }
        : undefined;
  return trashConfig[type].delegate.findFirst({
    where: { id, userId, archivedAt: { not: null } },
    ...(include ? { include } : {}),
  });
}

financeRouter.get(
  "/trash",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [
      loans,
      loanTransactions,
      expenses,
      expenseTransactions,
      investments,
      assets,
      categories,
      zakatCalculations,
    ] = await Promise.all([
      prisma.loan.findMany({
        where: { userId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: 100,
      }),
      prisma.loanTransaction.findMany({
        where: { userId, archivedAt: { not: null } },
        include: { loan: { select: { person: true } } },
        orderBy: { archivedAt: "desc" },
        take: 100,
      }),
      prisma.expense.findMany({
        where: { userId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: 100,
      }),
      prisma.expenseTransaction.findMany({
        where: { userId, archivedAt: { not: null } },
        include: {
          expense: {
            select: { name: true, mainCurrency: true, currency: true },
          },
        },
        orderBy: { archivedAt: "desc" },
        take: 100,
      }),
      prisma.investment.findMany({
        where: { userId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: 100,
      }),
      prisma.asset.findMany({
        where: { userId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: 100,
      }),
      prisma.expenseCategory.findMany({
        where: { userId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: 100,
      }),
      prisma.zakatCalculation.findMany({
        where: { userId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: 100,
      }),
    ]);

    const items = [
      ...loans.map((item) => trashItem("loans", item)),
      ...loanTransactions.map((item) => trashItem("loan-transactions", item)),
      ...expenses.map((item) => trashItem("expenses", item)),
      ...expenseTransactions.map((item) =>
        trashItem("expense-transactions", item),
      ),
      ...investments.map((item) => trashItem("investments", item)),
      ...assets.map((item) => trashItem("assets", item)),
      ...categories.map((item) => trashItem("categories", item)),
      ...zakatCalculations.map((item) => trashItem("zakat-calculations", item)),
    ].sort(
      (left, right) =>
        new Date(right.archivedAt).getTime() -
        new Date(left.archivedAt).getTime(),
    );

    return res.json({ data: items });
  }),
);

financeRouter.post(
  "/trash/:type/:id/restore",
  asyncHandler(async (req, res) => {
    const type = trashType.parse(req.params.type);
    const id = paramUuid(req.params.id);
    const item = await findArchivedTrashItem(type, id, req.user!.id);
    if (!item) throw notFound("Trash item not found");

    if (type === "expense-transactions") {
      const restored = await prisma.$transaction(async (tx) => {
        const result = await tx.expenseTransaction.updateMany({
          where: { id, userId: req.user!.id, archivedAt: { not: null } },
          data: { archivedAt: null },
        });
        if (result.count === 0) throw notFound("Trash item not found");
        await tx.attachment.updateMany({
          where: {
            userId: req.user!.id,
            entityType: "EXPENSE_TRANSACTION",
            entityId: id,
            archivedAt: { not: null },
          },
          data: { archivedAt: null },
        });
        await refreshExpenseTotal(
          tx,
          item.expenseId,
          req.user!.id,
          item.expense?.mainCurrency ??
            item.expense?.currency ??
            item.mainCurrency,
        );
        return tx.expenseTransaction.findUnique({ where: { id } });
      });
      return res.json({ data: restored });
    }

    if (type === "expenses") {
      await prisma.attachment.updateMany({
        where: {
          userId: req.user!.id,
          entityType: "EXPENSE",
          entityId: id,
          archivedAt: { not: null },
        },
        data: { archivedAt: null },
      });
    }

    const restored = await trashConfig[type].delegate.update({
      where: { id },
      data: { archivedAt: null },
    });
    return res.json({ data: restored });
  }),
);

financeRouter.delete(
  "/trash/:type/:id",
  asyncHandler(async (req, res) => {
    const type = trashType.parse(req.params.type);
    const id = paramUuid(req.params.id);
    const item = await findArchivedTrashItem(type, id, req.user!.id);
    if (!item) throw notFound("Trash item not found");

    if (type === "expense-transactions") {
      await prisma.$transaction(async (tx) => {
        await tx.attachment.deleteMany({
          where: {
            userId: req.user!.id,
            entityType: "EXPENSE_TRANSACTION",
            entityId: id,
          },
        });
        await tx.expenseTransaction.delete({ where: { id } });
        await refreshExpenseTotal(
          tx,
          item.expenseId,
          req.user!.id,
          item.expense?.mainCurrency ??
            item.expense?.currency ??
            item.mainCurrency,
        );
      });
      return res.status(204).send();
    }

    if (type === "expenses") {
      await prisma.attachment.deleteMany({
        where: { userId: req.user!.id, entityType: "EXPENSE", entityId: id },
      });
    }

    await trashConfig[type].delegate.delete({ where: { id } });
    return res.status(204).send();
  }),
);

financeRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const profile = await prisma.userPreference.findUnique({
      where: { userId: req.user!.id },
    });
    const [expenses, loans, investments, assets, latestZakat] =
      await Promise.all([
        prisma.expense.findMany({
          where: { userId: req.user!.id, archivedAt: null },
        }),
        prisma.loan.findMany({
          where: { userId: req.user!.id, archivedAt: null },
          include: { repayments: true },
        }),
        prisma.investment.findMany({
          where: { userId: req.user!.id, archivedAt: null },
        }),
        prisma.asset.findMany({
          where: { userId: req.user!.id, archivedAt: null },
        }),
        prisma.zakatCalculation.findFirst({
          where: { userId: req.user!.id, archivedAt: null },
          orderBy: { calculationDate: "desc" },
        }),
      ]);
    const linkedAssets = await linkedAssetValues(assets, req.user!.id);
    const assetCount = groupedAssetCount(linkedAssets);
    const baseCurrency = profile?.baseCurrency ?? "USD";
    const hasMixedCurrency =
      new Set([
        ...expenses.map((item: { currency: string }) => item.currency),
        ...loans.map((item: { currency: string }) => item.currency),
        ...investments.map((item: { currency: string }) => item.currency),
        ...linkedAssets.map((item: { currency: string }) => item.currency),
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
          assets: assetCount,
        },
        latestZakat,
        recent: {
          expenses: expenses.slice(0, 5),
          loans: loans.slice(0, 5),
          investments: investments.slice(0, 5),
          assets: linkedAssets.slice(0, 5),
        },
      },
    });
  }),
);

function csvSafe(value: unknown) {
  const text = String(value ?? "");
  const escaped = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${escaped.replaceAll('"', '""')}"`;
}

financeRouter.get(
  "/exports/:module.csv",
  asyncHandler(async (req, res) => {
    const moduleName = z
      .enum(["expenses", "loans", "investments", "assets"])
      .parse(req.params.module);
    const delegate: any = {
      expenses: prisma.expense,
      loans: prisma.loan,
      investments: prisma.investment,
      assets: prisma.asset,
    }[moduleName];
    const rows = await delegate.findMany({
      where: { userId: req.user!.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const headers = rows[0]
      ? Object.keys(rows[0]).filter((key) => !["userId"].includes(key))
      : ["id"];
    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row: Record<string, unknown>) =>
        headers.map((header) => csvSafe(row[header])).join(","),
      ),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${moduleName}.csv"`,
    );
    return res.send(csv);
  }),
);
