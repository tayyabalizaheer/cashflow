import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/security.js";

export type AuthUser = {
  id: string;
  email: string;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw unauthorized();
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    throw unauthorized();
  }
}
