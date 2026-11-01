import { z } from 'zod';

// ─── Automation (Round 2 review, A1–A9) ────────────────────────────────────────

/** The admin's automation switches and limits; each one is a Setting (CLAUDE.md rule 4). */
export const AutomationSettingsSchema = z
  .object({
    /** A1: close running batches that ended and have every student decided. */
    autoCloseBatches: z.boolean(),
    /** A1: days after the end date before a ready batch is closed automatically. */
    autoCloseAfterDays: z.number().int().min(0).max(90),
    /** A2: place the next waitlisted applicant when a seat frees up. */
    autoPromoteWaitlist: z.boolean(),
    /** A2: how many days after a batch starts it still takes waitlisted applicants. */
    latePlacementDays: z.number().int().min(0).max(60),
    /** A3: daily reminders to trainers and admins. */
    reminders: z.boolean(),
    /** A3: remind admins about applications pending longer than this many days. */
    pendingReminderDays: z.number().int().min(1).max(60),
    /** A4: notices to students (windows opening, passport links expiring, matching jobs). */
    notices: z.boolean(),
    /** A4: warn a student this many days before a passport link expires. */
    passportExpiryNoticeDays: z.number().int().min(1).max(60),
    /** A4: tell students about a new opportunity they match at least this well (%). */
    opportunityMatchPercent: z.number().min(0).max(100),
    /** A9: ask admins to confirm a placement this many days after it started. */
    placementFollowUpDays: z.number().int().min(7).max(730),
    /** A8: refresh outcome analytics after certificates if older than this many minutes. */
    analyticsAutoRefreshMinutes: z.number().int().min(1).max(1440),
  })
  .strict();
export type AutomationSettings = z.infer<typeof AutomationSettingsSchema>;

/** The daily run's steps, in the order they run. */
export const AUTOMATION_STEPS = [
  'autoApproval',
  'waitlist',
  'autoClose',
  'reminders',
  'notices',
  'placementFollowUp',
] as const;
export type AutomationStep = (typeof AUTOMATION_STEPS)[number];

export interface AutomationStepResult {
  step: AutomationStep;
  /** False when the step's switch is off. */
  enabled: boolean;
  /** What the step did: applications approved, students placed, batches closed, notices sent. */
  count: number;
  /** Set when the step failed; the other steps still ran. */
  error?: string;
}

export interface AutomationRun {
  ranAt: string;
  steps: AutomationStepResult[];
}

export interface AutomationStatus {
  settings: AutomationSettings;
  /** The last daily run (scheduled or run now), or null if it never ran. */
  lastRun: AutomationRun | null;
  lastSuccessAt: string | null;
}
