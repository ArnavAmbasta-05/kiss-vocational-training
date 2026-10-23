import { z } from 'zod';
import {
  AssessmentModeSchema,
  LearningResourceTypeSchema,
  type AssessmentMode,
  type LearningResourceType,
} from '../enums';

// ─── Competency model (BRD §9.1: BRQ-C.1, BRQ-C.2, BR-13) ─────────────────────

/** Proficiency levels 1 Aware, 2 Assisted, 3 Independent, 4 Can teach others. */
export const PROFICIENCY_LEVELS = [1, 2, 3, 4] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];
const level = z.coerce.number().int().min(1).max(4);

export const CompetencyInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/, '1–20 letters, digits or dashes'),
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    mode: AssessmentModeSchema,
    requiredLevel: level,
    isMandatory: z.boolean(),
    /** Assessments (of this course's batches) that evidence the competency. */
    assessmentIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();
export type CompetencyInput = z.infer<typeof CompetencyInputSchema>;

export interface CompetencyDto {
  id: string;
  courseId: string;
  code: string;
  title: string;
  description: string | null;
  mode: AssessmentMode;
  requiredLevel: number;
  isMandatory: boolean;
  assessments: Array<{ id: string; title: string; batchName: string }>;
  /** Approved resources; pending ones are counted, not listed. */
  resourceCount: number;
  ratingCount: number;
}

/** An assessment that can be linked, from any batch of the course. */
export interface LinkableAssessment {
  id: string;
  title: string;
  mode: AssessmentMode;
  batchId: string;
  batchName: string;
}

// ─── Learning resources (BRQ-12.3: curated by trainers or Admin) ──────────────

export const ResourceInputSchema = z
  .object({
    competencyId: z.string().uuid(),
    title: z.string().trim().min(3).max(200),
    type: LearningResourceTypeSchema,
    url: z
      .string()
      .trim()
      .url()
      .max(500)
      .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) link'),
  })
  .strict();
export type ResourceInput = z.infer<typeof ResourceInputSchema>;

export interface ResourceDto {
  id: string;
  competencyId: string;
  competencyCode: string;
  competencyTitle: string;
  title: string;
  type: LearningResourceType;
  url: string;
  createdBy: string;
  /** Only approved resources are recommended to students. */
  approved: boolean;
  approvedBy: string | null;
}

// ─── Ratings (BRQ-C.2, BR-13) ──────────────────────────────────────────────────

export const RatingsSaveSchema = z
  .object({
    ratings: z
      .array(
        z
          .object({
            studentId: z.string().uuid(),
            competencyId: z.string().uuid(),
            level,
            /** Confirm the competency as verified (only at or above the required level). */
            verify: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2000)
      .refine((r) => new Set(r.map((x) => `${x.studentId}:${x.competencyId}`)).size === r.length, {
        message: 'Each student and competency can appear only once',
      }),
  })
  .strict();
export type RatingsSaveInput = z.infer<typeof RatingsSaveSchema>;

export interface RatingCell {
  studentId: string;
  competencyId: string;
  level: number;
  verified: boolean;
  ratedAt: string;
}

export interface RatingGrid {
  batchId: string;
  editable: boolean;
  competencies: Array<
    Pick<CompetencyDto, 'id' | 'code' | 'title' | 'mode' | 'requiredLevel' | 'isMandatory'>
  >;
  students: Array<{ studentId: string; rollNo: string; fullName: string }>;
  ratings: RatingCell[];
}

// ─── Gaps (F12: BRQ-12.1–12.4, BR-18) ──────────────────────────────────────────

export type LevelSource = 'RATING' | 'PROVISIONAL' | 'NOT_ASSESSED';

export interface CompetencyStanding {
  competencyId: string;
  code: string;
  title: string;
  mode: AssessmentMode;
  isMandatory: boolean;
  requiredLevel: number;
  /** Null when not assessed. */
  demonstratedLevel: number | null;
  source: LevelSource;
  verified: boolean;
  /** max(0, required − demonstrated); the full required level when not assessed. */
  gap: number;
}

export interface GapItem extends CompetencyStanding {
  recommendations: Array<Pick<ResourceDto, 'id' | 'title' | 'type' | 'url'>>;
}

export interface StudentGaps {
  batch: { id: string; name: string; courseTitle: string } | null;
  /** Assessed but below the required level, largest gap first. */
  belowLevel: GapItem[];
  /** No rating and no linked result yet. */
  notAssessed: GapItem[];
  /** At or above the required level. */
  met: CompetencyStanding[];
}

export interface HeatmapCell {
  competencyId: string;
  level: number | null;
  source: LevelSource;
  verified: boolean;
  gap: number;
  /** Assessed and below the required level (BRD acceptance: highlighted). */
  below: boolean;
}

export interface Heatmap {
  batchId: string;
  competencies: RatingGrid['competencies'];
  rows: Array<{ studentId: string; rollNo: string; fullName: string; cells: HeatmapCell[] }>;
}
