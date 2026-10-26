import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

/** One session to check: proposed (not yet saved) or an existing one of the batch. */
export const ProposedSessionSchema = z
  .object({
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    venue: z.string().trim().min(1).max(120).optional(),
    trainerId: z.string().uuid().optional(),
  })
  .refine((s) => new Date(s.endsAt) > new Date(s.startsAt), {
    message: 'The session must end after it starts',
    path: ['endsAt'],
  });
export type ProposedSession = z.infer<typeof ProposedSessionSchema>;

/**
 * POST /scheduling/check (F14). Each item is a batch, with optional proposed sessions and the
 * number of students about to be added (the allocation preview passes its fills).
 */
export const SchedulingCheckSchema = z
  .object({
    batches: z
      .array(
        z
          .object({
            batchId: z.string().uuid(),
            addStudents: z.number().int().min(0).max(1000).default(0),
            sessions: z.array(ProposedSessionSchema).max(200).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type SchedulingCheckInput = z.infer<typeof SchedulingCheckSchema>;

export type CapacityLevel = 'OK' | 'NEAR' | 'OVER';

/** BR-20 clash. `hard` clashes block saving; soft ones are warnings for the admin. */
export interface ScheduleClash {
  kind: 'VENUE' | 'TRAINER';
  hard: boolean;
  /** The checked session (proposed or existing in this batch). */
  session: { startsAt: string; endsAt: string; venue: string; proposed: boolean };
  /** The other session it overlaps. */
  with: {
    sessionId: string;
    batchId: string;
    batchName: string;
    startsAt: string;
    endsAt: string;
    venue: string;
  };
  trainer?: { id: string; fullName: string };
}

export interface BatchScheduleAdvice {
  batchId: string;
  batchName: string;
  capacity: {
    capacity: number;
    enrolled: number;
    projected: number;
    percent: number;
    level: CapacityLevel;
    warnAt: number;
  };
  clashes: ScheduleClash[];
  /** Assigned trainers; empty means nobody can teach the batch yet. */
  trainers: Array<{ id: string; fullName: string }>;
  suggestions: {
    /** Free slots near each clashing proposed session (same length, no venue or trainer clash). */
    slots: Array<{ forStartsAt: string; startsAt: string; endsAt: string }>;
    /** Active trainers free for all of the batch's upcoming sessions, best match first. */
    trainers: Array<{ id: string; fullName: string; specialization: string | null }>;
  };
}

export interface SchedulingCheckResult {
  batches: BatchScheduleAdvice[];
}
