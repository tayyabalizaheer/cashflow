import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { env, isProduction } from "../config/env.js";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export const refreshCookieName = "cashflow_refresh";

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    audience: "cash-flow-web",
    issuer: "cash-flow-api"
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    audience: "cash-flow-web",
    issuer: "cash-flow-api"
  }) as AccessTokenPayload;
}

export function createOpaqueToken() {
  return nanoid(48);
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    maxAge: maxAgeMs,
    path: "/api/v1/auth"
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
