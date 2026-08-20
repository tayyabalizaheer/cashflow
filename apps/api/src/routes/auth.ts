import argon2 from "argon2";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError, unauthorized } from "../utils/errors.js";
import {
  createOpaqueToken,
  hashToken,
  normalizeEmail,
  refreshCookieName,
  refreshCookieOptions,
  signAccessToken
} from "../utils/security.js";

export const authRouter = Router();

const passwordSchema = z.string().min(10).max(128);
const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters.").max(120, "Full name is too long."),
    email: z.string().email("Enter a valid email address."),
    password: z
      .string()
      .min(10, "Password must be at least 10 characters.")
      .max(128, "Password is too long."),
    passwordConfirmation: z.string().min(1, "Confirm your password."),
    termsAccepted: z.literal(true, "Accept the terms to create an account.")
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match"
  });

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  rememberMe: z.boolean().default(false)
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address.")
});

const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: passwordSchema,
    passwordConfirmation: z.string()
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match"
  });

async function issueSession(user: { id: string; email: string }, rememberMe: boolean, req: any, res: any) {
  const refreshToken = createOpaqueToken();
  const ttlDays = rememberMe ? env.REMEMBER_ME_REFRESH_TOKEN_TTL_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId: createOpaqueToken(),
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] ?? null
    }
  });

  res.cookie(refreshCookieName, refreshToken, refreshCookieOptions(ttlDays * 24 * 60 * 60 * 1000));
  return signAccessToken({ sub: user.id, email: user.email });
}

async function seedDefaultCategories(userId: string) {
  const categories: Array<[string, string, string]> = [
    ["Housing", "#0f766e", "home"],
    ["Food", "#65a30d", "utensils"],
    ["Transport", "#2563eb", "car"],
    ["Utilities", "#0891b2", "plug"],
    ["Health", "#dc2626", "heart-pulse"],
    ["Education", "#7c3aed", "graduation-cap"],
    ["Entertainment", "#c2410c", "ticket"],
    ["Charity", "#047857", "hand-heart"],
    ["Shopping", "#be123c", "shopping-bag"],
    ["Other", "#64748b", "circle"]
  ];

  await prisma.expenseCategory.createMany({
    data: categories.map(([name, color, icon]) => ({ userId, name, color, icon }))
  });
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "An account with this email already exists", "EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        fullName: input.fullName,
        email,
        passwordHash,
        termsAcceptedAt: new Date(),
        preferences: {
          create: {}
        }
      },
      select: { id: true, email: true, fullName: true }
    });
    await seedDefaultCategories(user.id);
    await prisma.auditEvent.create({ data: { userId: user.id, action: "auth.register" } });

    const accessToken = await issueSession(user, false, req, res);
    return res.status(201).json({ data: { user, accessToken } });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });
    const genericError = new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");

    if (!user || user.deletedAt || (user.lockedUntil && user.lockedUntil > new Date())) {
      throw genericError;
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      const failedLoginCount = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil:
            failedLoginCount >= 5 ? new Date(Date.now() + Math.min(failedLoginCount, 15) * 60_000) : null
        }
      });
      throw genericError;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null }
    });
    await prisma.auditEvent.create({ data: { userId: user.id, action: "auth.login" } });
    const accessToken = await issueSession(user, input.rememberMe, req, res);

    return res.json({
      data: {
        user: { id: user.id, email: user.email, fullName: user.fullName },
        accessToken
      }
    });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[refreshCookieName];
    if (!token) throw unauthorized();

    const tokenHash = hashToken(token);
    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.deletedAt) {
      throw unauthorized();
    }

    const refreshToken = createOpaqueToken();
    const ttlMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    const nextSession = await prisma.refreshSession.create({
      data: {
        userId: session.userId,
        tokenHash: hashToken(refreshToken),
        familyId: session.familyId,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] ?? null
      }
    });
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedByTokenId: nextSession.id }
    });

    res.cookie(refreshCookieName, refreshToken, refreshCookieOptions(ttlMs));
    const accessToken = signAccessToken({ sub: session.userId, email: session.user.email });
    return res.json({
      data: {
        user: { id: session.user.id, email: session.user.email, fullName: session.user.fullName },
        accessToken
      }
    });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[refreshCookieName];
    if (token) {
      await prisma.refreshSession.updateMany({
        where: { userId: req.user!.id, tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
    res.clearCookie(refreshCookieName, { path: "/api/v1/auth" });
    return res.status(204).send();
  })
);

authRouter.post(
  "/logout-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.refreshSession.updateMany({
      where: { userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    res.clearCookie(refreshCookieName, { path: "/api/v1/auth" });
    return res.status(204).send();
  })
);

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (user && !user.deletedAt) {
      const token = createOpaqueToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      });
      await prisma.auditEvent.create({
        data: { userId: user.id, action: "auth.password_reset_requested" }
      });
      if (env.NODE_ENV !== "production") {
        return res.json({ data: { message: "If the account exists, reset instructions were sent.", devToken: token } });
      }
    }
    return res.json({ data: { message: "If the account exists, reset instructions were sent." } });
  })
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    const reset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) }
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new ApiError(400, "The reset link is invalid or expired", "RESET_TOKEN_INVALID");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) }
      }),
      prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() }
      }),
      prisma.refreshSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);

    return res.json({ data: { message: "Password updated. Please sign in again." } });
  })
);
