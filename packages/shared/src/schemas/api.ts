import { z } from 'zod';

/** Error codes are UPPER_SNAKE; every API error uses this body. */
export const ErrorCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type PageMeta = z.infer<typeof PageMetaSchema>;

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  version: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Most records one admin bulk status change may touch. */
export const BULK_STATUS_MAX = 100;

/** Deactivate or reactivate several records at once (admin clean-up of courses and users). */
export const BulkStatusSchema = z
  .object({
    ids: z
      .array(z.string().uuid())
      .min(1)
      .max(BULK_STATUS_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Duplicate ids' }),
    isActive: z.boolean(),
  })
  .strict();
export type BulkStatusInput = z.infer<typeof BulkStatusSchema>;

export interface BulkStatusResult {
  /** Records whose status changed; ones already in the requested state are left alone. */
  updated: number;
}
