import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { fromZodError } from '../errors';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and replaces req.body / req.query / req.params with the parsed (coerced,
 * stripped) values. Failures become 422 VALIDATION_FAILED with per-field details.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) return next(fromZodError(result.error));
      // Redefine rather than assign: req.query is getter-backed, so plain assignment can be lost.
      Object.defineProperty(req, part, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
}
