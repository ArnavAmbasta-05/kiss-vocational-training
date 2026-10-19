import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@vtmp/shared';
import { AppError } from './AppError';

export function toErrorBody(err: AppError): ApiErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details?.length ? { details: err.details } : {}),
    },
  };
}

export function fromZodError(err: ZodError): AppError {
  return AppError.unprocessable(
    'VALIDATION_FAILED',
    'The request contains invalid data',
    err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND'));
};

/** Central error handler: every error leaves the API as { error: { code, message } }. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = fromZodError(err);
  } else if (isBodyParserError(err)) {
    appError = AppError.badRequest('MALFORMED_JSON', 'Request body is not valid JSON');
  } else {
    req.log?.error({ err }, 'unhandled error');
    appError = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
  res.status(appError.status).json(toErrorBody(appError));
};

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: unknown }).type === 'entity.parse.failed'
  );
}
