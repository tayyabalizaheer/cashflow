import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const syncRouter = Router();
syncRouter.use(requireAuth);

const syncOperationSchema = z.object({
  clientMutationId: z.string().min(12).max(120),
  entityType: z.string().min(2).max(80),
  entityId: z.string().optional(),
  operation: z.enum(["CREATE", "UPDATE", "ARCHIVE", "DELETE"]),
  payload: z.record(z.string(), z.unknown()).default({})
});

const syncPushSchema = z.object({
  operations: z.array(syncOperationSchema).max(100)
});

syncRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const [pending, failed, synced] = await Promise.all([
      prisma.syncOutbox.count({ where: { userId: req.user!.id, status: "PENDING" } }),
      prisma.syncOutbox.count({ where: { userId: req.user!.id, status: "FAILED" } }),
      prisma.syncOutbox.count({ where: { userId: req.user!.id, status: "SYNCED" } })
    ]);

    return res.json({
      data: {
        pending,
        failed,
        synced,
        serverOnline: true
      }
    });
  })
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
            status: "PENDING"
          },
          update: {
            lastAttemptAt: new Date()
          }
        })
      )
    );

    return res.status(202).json({
      data: {
        accepted: results.length,
        message: "Operations are queued for online sync."
      }
    });
  })
);
