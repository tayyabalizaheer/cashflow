import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { linkedAssetValues } from "../services/assets.js";
import { asyncHandler } from "../utils/async-handler.js";

export const syncRouter = Router();
syncRouter.use(requireAuth);

const syncOperationSchema = z.object({
  clientMutationId: z.string().min(12).max(120),
  entityType: z.string().min(2).max(80),
  entityId: z.string().optional(),
  operation: z.enum(["CREATE", "UPDATE", "ARCHIVE", "DELETE"]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const syncPushSchema = z.object({
  operations: z.array(syncOperationSchema).max(100),
});

syncRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const [pending, failed, synced] = await Promise.all([
      prisma.syncOutbox.count({
        where: { userId: req.user!.id, status: "PENDING" },
      }),
      prisma.syncOutbox.count({
        where: { userId: req.user!.id, status: "FAILED" },
      }),
      prisma.syncOutbox.count({
        where: { userId: req.user!.id, status: "SYNCED" },
      }),
    ]);

    return res.json({
      data: {
        pending,
        failed,
        synced,
        serverOnline: true,
      },
    });
  }),
);

syncRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const modules = [
      [
        "expenses",
        await prisma.expense.count({ where: { userId, archivedAt: null } }),
      ],
      [
        "loans",
        await prisma.loan.count({ where: { userId, archivedAt: null } }),
      ],
      [
        "investments",
        await prisma.investment.count({ where: { userId, archivedAt: null } }),
      ],
      [
        "assets",
        await prisma.asset.count({ where: { userId, archivedAt: null } }),
      ],
    ].map(([module, count]) => ({ module, count: Number(count) }));

    return res.json({
      data: {
        total: modules.reduce((sum, item) => sum + item.count, 0),
        modules,
      },
    });
  }),
);

syncRouter.get(
  "/bootstrap",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [loans, investments, assets] = await Promise.all([
      prisma.loan.findMany({
        where: { userId, archivedAt: null },
        include: {
          transactions: {
            where: { archivedAt: null },
            orderBy: { createdAt: "desc" },
          },
          repayments: { where: { archivedAt: null } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.investment.findMany({
        where: { userId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.asset.findMany({
        where: { userId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    const expenses = await prisma.expense.findMany({
      where: { userId, archivedAt: null },
      include: {
        currencies: {
          include: { currency: true },
          orderBy: [{ isMain: "desc" }, { currencyCode: "asc" }],
        },
        transactions: {
          where: { archivedAt: null },
          include: {
            amounts: {
              include: { currency: true },
              orderBy: { currencyCode: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        amounts: {
          include: { currency: true },
          orderBy: { currencyCode: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    const transactionIds = expenses.flatMap((expense) =>
      expense.transactions.map((transaction) => transaction.id),
    );
    const expenseAttachments = transactionIds.length
      ? await prisma.attachment.findMany({
          where: {
            userId,
            entityType: "EXPENSE_TRANSACTION",
            entityId: { in: transactionIds },
            archivedAt: null,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const expenseAttachmentsByEntity = new Map<
      string,
      typeof expenseAttachments
    >();
    expenseAttachments.forEach((attachment) => {
      expenseAttachmentsByEntity.set(attachment.entityId, [
        ...(expenseAttachmentsByEntity.get(attachment.entityId) ?? []),
        attachment,
      ]);
    });
    const expensesWithAttachments = expenses.map((expense) => ({
      ...expense,
      transactions: expense.transactions.map((transaction) => ({
        ...transaction,
        attachments: expenseAttachmentsByEntity.get(transaction.id) ?? [],
      })),
    }));
    const loanTransactionIds = loans.flatMap((loan) =>
      loan.transactions.map((transaction) => transaction.id),
    );
    const loanAttachments = loanTransactionIds.length
      ? await prisma.attachment.findMany({
          where: {
            userId,
            entityType: "LOAN_TRANSACTION",
            entityId: { in: loanTransactionIds },
            archivedAt: null,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const loanAttachmentsByEntity = new Map<string, typeof loanAttachments>();
    loanAttachments.forEach((attachment) => {
      loanAttachmentsByEntity.set(attachment.entityId, [
        ...(loanAttachmentsByEntity.get(attachment.entityId) ?? []),
        attachment,
      ]);
    });
    const loansWithAttachments = loans.map((loan) => ({
      ...loan,
      transactions: loan.transactions.map((transaction) => ({
        ...transaction,
        attachments: loanAttachmentsByEntity.get(transaction.id) ?? [],
      })),
    }));
    const linkedAssets = await linkedAssetValues(assets, userId);

    return res.json({
      data: {
        expenses: expensesWithAttachments,
        loans: loansWithAttachments,
        investments,
        assets: linkedAssets,
        fetchedAt: new Date().toISOString(),
      },
    });
  }),
);

syncRouter.post(
  "/push",
  asyncHandler(async (req, res) => {
    const input = syncPushSchema.parse(req.body);
    const results = await Promise.all(
      input.operations.map((operation) =>
        prisma.syncOutbox.upsert({
          where: { clientMutationId: operation.clientMutationId },
          create: {
            userId: req.user!.id,
            clientMutationId: operation.clientMutationId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            operation: operation.operation,
            payload: operation.payload as Prisma.InputJsonValue,
            status: "PENDING",
          },
          update: {
            lastAttemptAt: new Date(),
          },
        }),
      ),
    );

    return res.status(202).json({
      data: {
        accepted: results.length,
        message: "Operations are queued for online sync.",
      },
    });
  }),
);
