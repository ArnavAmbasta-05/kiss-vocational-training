import { z } from 'zod';
import { OpportunityTypeSchema, type OpportunityType } from '../enums';
import { PaginationQuerySchema } from './api';

export const OPPORTUNITY_TYPES = OpportunityTypeSchema.options;

const competencyCode = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only')
  .transform((v) => v.toUpperCase());

/** BRQ-C.3: a job role is a list of required competency codes and levels. */
export const JobRoleSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    isActive: z.boolean().optional(),
    competencies: z
      .array(z.object({ code: competencyCode, level: z.number().int().min(1).max(4) }).strict())
      .min(1)
      .max(30)
      .refine(
        (c) => new Set(c.map((x) => x.code)).size === c.length,
        'Each competency code may appear once',
      ),
  })
  .strict();
export type JobRoleInput = z.infer<typeof JobRoleSchema>;

export interface JobRoleDto {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  competencies: Array<{ code: string; level: number; title: string | null }>;
  opportunityCount: number;
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const OpportunitySchema = z
  .object({
    roleId: z.string().uuid(),
    title: z.string().trim().min(2).max(160),
    type: OpportunityTypeSchema,
    partner: z.string().trim().min(2).max(160),
    location: z.string().trim().max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    closesOn: isoDay,
    isActive: z.boolean().optional(),
  })
  .strict();
export type OpportunityInput = z.infer<typeof OpportunitySchema>;

export interface OpportunityDto {
  id: string;
  role: { id: string; title: string };
  title: string;
  type: OpportunityType;
  partner: string;
  location: string | null;
  description: string | null;
  closesOn: string;
  isActive: boolean;
  /** Closed once closesOn has passed (IST calendar day). */
  isOpen: boolean;
  interestedCount: number;
}

export const OpportunityListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['OPEN', 'CLOSED', 'ALL']).default('ALL'),
});
export type OpportunityListQuery = z.infer<typeof OpportunityListQuerySchema>;

/** BR-22, BRQ-13.2, 13.3: one opportunity ranked for the signed-in student. */
export interface OpportunityMatch {
  opportunity: OpportunityDto;
  /** verified required ÷ total required × 100, two decimals. */
  matchPercent: number;
  verified: number;
  required: number;
  /** Required competencies the student has not verified at the level, with how to close them. */
  missing: Array<{
    code: string;
    title: string | null;
    requiredLevel: number;
    /** Highest verified level for this code, if any (below the requirement). */
    verifiedLevel: number | null;
    /** From the gap analyzer when the student's course has this competency. */
    resources: Array<{ id: string; title: string; type: string; url: string | null }>;
  }>;
  interested: boolean;
}

/** BRQ-13.4: an admin's view of who is interested in an opportunity, with their match. */
export interface InterestedStudent {
  studentId: string;
  fullName: string;
  rollNo: string;
  email: string;
  matchPercent: number;
  interestedAt: string;
}
