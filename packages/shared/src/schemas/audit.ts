import { z } from 'zod';
import { PaginationQuerySchema } from './api';

/** One AuditLog row for the read-only viewer (F19, BRQ-19.2). */
export interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  /** Null for system jobs such as the daily risk evaluation. */
  user: { id: string; fullName: string; email: string } | null;
  oldValue: unknown;
  newValue: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AuditFacets {
  entities: string[];
  actions: string[];
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const AuditQuerySchema = PaginationQuerySchema.extend({
  userId: z.string().uuid().optional(),
  entity: z.string().trim().min(1).max(60).optional(),
  entityId: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(60).optional(),
  /** Inclusive calendar days (UTC). */
  from: isoDay.optional(),
  to: isoDay.optional(),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;
