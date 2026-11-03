import { Request, Response, NextFunction } from 'express';
import { ApiErrorCode } from '@shopright/shared-types';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Handle unexpected errors (never leak stack trace in production)
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An unexpected internal server error occurred.',
    },
  });
}
