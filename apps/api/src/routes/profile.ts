import argon2 from "argon2";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError, notFound } from "../utils/errors.js";

export const profileRouter = Router();
profileRouter.use(requireAuth);

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  baseCurrency: z.string().length(3),
  locale: z.string().min(2).max(20),
  timeZone: z.string().min(1).max(80),
  theme: z.enum(["system", "light", "dark"])
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128)
});

profileRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { id: req.user!.id, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerifiedAt: true,
        preferences: true,
        createdAt: true
      }
    });
    if (!user) throw notFound("Profile not found");
    return res.json({ data: user });
  })
);

profileRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const input = profileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        fullName: input.fullName,
        preferences: {
          upsert: {
            create: {
              baseCurrency: input.baseCurrency.toUpperCase(),
              locale: input.locale,
              timeZone: input.timeZone,
              theme: input.theme
            },
            update: {
              baseCurrency: input.baseCurrency.toUpperCase(),
              locale: input.locale,
              timeZone: input.timeZone,
              theme: input.theme
            }
          }
        }
      },
      select: { id: true, fullName: true, email: true, preferences: true }
    });
    return res.json({ data: user });
  })
);

profileRouter.post(
  "/change-password",
  asyncHandler(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await argon2.verify(user.passwordHash, input.currentPassword))) {
      throw new ApiError(400, "Current password is incorrect", "CURRENT_PASSWORD_INVALID");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(input.newPassword, { type: argon2.argon2id }) }
    });
    await prisma.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return res.json({ data: { message: "Password changed. Sign in again on other devices." } });
  })
);
