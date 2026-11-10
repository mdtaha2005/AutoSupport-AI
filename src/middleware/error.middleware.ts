import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { logger } from '../config/logger.js';
import { sendError } from '../utils/response.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Handled AppError
  if (err instanceof AppError) {
    logger.warn(`Operational Error: ${err.message}`, {
      statusCode: err.statusCode,
      errors: err.errors,
    });
    sendError(res, err.message, err.statusCode, err.errors);
    return;
  }

  // 2. Zod Validation Error (if uncaught by validateRequest)
  if (err instanceof ZodError) {
    const formatted = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    logger.warn('Validation Error', { errors: formatted });
    sendError(res, 'Validation error', 400, formatted);
    return;
  }

  // 3. Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn(`Prisma Known Error [${err.code}]: ${err.message}`);

    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      sendError(res, `Unique constraint violation on ${target}`, 409);
      return;
    }

    if (err.code === 'P2025') {
      sendError(res, 'Requested database record not found', 404);
      return;
    }

    if (err.code === 'P2003') {
      sendError(res, 'Foreign key constraint violated', 400, {
        field: err.meta?.field_name,
      });
      return;
    }

    sendError(res, 'Database operation error', 400, { code: err.code });
    return;
  }

  // 4. JSON parse error
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    logger.warn('Malformed JSON payload');
    sendError(res, 'Malformed JSON payload', 400);
    return;
  }

  // 5. Unexpected / Unhandled Errors
  logger.error('Unhandled Server Error:', {
    message: err.message,
    stack: err.stack,
  });

  const message = env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  const errors = env.NODE_ENV === 'production' ? undefined : { stack: err.stack };

  sendError(res, message, 500, errors);
}
