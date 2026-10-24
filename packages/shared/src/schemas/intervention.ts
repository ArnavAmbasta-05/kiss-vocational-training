import { z } from 'zod';
import {
  InterventionActionTypeSchema,
  RiskLevelSchema,
  type InterventionActionType,
  type RiskLevel,
} from '../enums';
import { PaginationQuerySchema } from './api';

/** Why a student is flagged (BR-16, BR-18). Each code is also an i18n key. */
export const RISK_REASON_CODES = [
  'ATTENDANCE_BELOW_MEDIUM',
  'ATTENDANCE_BELOW_HIGH',
  'CONSECUTIVE_ABSENCES',
  'ASSESSMENT_BELOW',
  'PROJECTED_BELOW',
  'SCORE_DROP',
  'MANDATORY_GAP',
] as const;
export type RiskReasonCode = (typeof RISK_REASON_CODES)[number];

export interface RiskReason {
  code: RiskReasonCode;
  level: Exclude<RiskLevel, 'LOW'>;
  /** The student's figure (%, count or points); for MANDATORY_GAP, the gap in levels. */
  actual: number;
  /** The threshold it crossed; for MANDATORY_GAP, the required level. */
  threshold: number;
  /** MANDATORY_GAP only: the competency title. */
  competency?: string;
}

export type RiskFlagStatus = 'OPEN' | 'CLOSED';

export interface InterventionActionDto {
  id: string;
  flagId: string;
  type: InterventionActionType;
  owner: { id: string; fullName: string };
  dueOn: string;
  note: string | null;
  outcome: string | null;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface RiskFlagRow {
  id: string;
  student: { id: string; fullName: string; rollNo: string };
  batch: { id: string; name: string };
  level: RiskLevel;
  reasons: RiskReason[];
  status: RiskFlagStatus;
  openedAt: string;
  /** All triggers have been clear since then; the flag closes after the clear period. */
  clearSince: string | null;
  closedAt: string | null;
  escalatedAt: string | null;
  actionCount: number;
  openActionCount: number;
}

export type RiskTimelineKind =
  | 'OPENED'
  | 'LEVEL_CHANGED'
  | 'CLEARING'
  | 'CLOSED'
  | 'ESCALATED'
  | 'ACTION_ADDED'
  | 'ACTION_COMPLETED';

export interface RiskTimelineEvent {
  at: string;
  kind: RiskTimelineKind;
  level?: RiskLevel;
  previousLevel?: RiskLevel;
  reasons?: RiskReason[];
  actionType?: InterventionActionType;
  outcome?: string;
  /** Who did it; null for the scheduled evaluation. */
  by: string | null;
}

export interface RiskFlagDetail extends RiskFlagRow {
  actions: InterventionActionDto[];
  timeline: RiskTimelineEvent[];
  /** People an action can be assigned to: the batch's trainers and the admins. */
  ownerOptions: Array<{ id: string; fullName: string; role: 'TRAINER' | 'ADMIN' }>;
  /** Days the flag stays open once its triggers clear (BR-17), for the UI's explanation. */
  closeAfterClearDays: number;
}

/** The student's own, supportive view (BRQ-11.5): no other students, no staff notes. */
export interface MyRiskFlag {
  id: string;
  batch: { id: string; name: string };
  level: RiskLevel;
  reasons: RiskReason[];
  clearSince: string | null;
  actions: Array<{
    id: string;
    type: InterventionActionType;
    owner: string;
    dueOn: string;
    completedAt: string | null;
  }>;
}

export interface RiskEvaluationSummary {
  batches: number;
  students: number;
  opened: number;
  updated: number;
  clearing: number;
  closed: number;
  escalated: number;
}

export const RiskFlagQuerySchema = PaginationQuerySchema.extend({
  batchId: z.string().uuid().optional(),
  level: RiskLevelSchema.optional(),
  status: z.enum(['OPEN', 'CLOSED', 'ALL']).default('OPEN'),
  escalated: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type RiskFlagQuery = z.infer<typeof RiskFlagQuerySchema>;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const ActionCreateSchema = z.object({
  type: InterventionActionTypeSchema,
  ownerId: z.string().uuid(),
  dueOn: isoDay,
  note: z.string().trim().max(1000).optional(),
});
export type ActionCreateInput = z.infer<typeof ActionCreateSchema>;

export const ActionUpdateSchema = z.object({
  outcome: z.string().trim().min(3).max(1000),
  completedAt: z.string().datetime({ offset: true }).optional(),
});
export type ActionUpdateInput = z.infer<typeof ActionUpdateSchema>;
