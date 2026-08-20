import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "APP_ERROR",
    public details?: unknown
  ) {
    super(message);
  }
}

export const notFound = (message = "Resource not found") => new ApiError(404, message, "NOT_FOUND");
export const forbidden = () => new ApiError(403, "You do not have access to this resource", "FORBIDDEN");
export const unauthorized = () => new ApiError(401, "Authentication is required", "UNAUTHORIZED");

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    const fieldErrors = error.issues.reduce<Record<string, string[]>>((acc, issue) => {
      const field = issue.path.join(".") || "form";
      acc[field] = [...(acc[field] ?? []), issue.message];
      return acc;
    }, {});

    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please fix the highlighted fields.",
        details: {
          fieldErrors,
          formErrors: fieldErrors.form ?? []
        }
      }
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  console.error(error);
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong"
    }
  });
}
