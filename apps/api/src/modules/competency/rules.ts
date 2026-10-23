import type { LevelSource } from '@vtmp/shared';

export interface ProvisionalBands {
  L2: number;
  L3: number;
  L4: number;
}

/**
 * Provisional level from linked assessment results (setting competency.provisionalBands):
 * below L2 → 1, from L2 → 2, from L3 → 3, from L4 → 4. Lower bounds are inclusive.
 */
export function provisionalLevel(percent: number, bands: ProvisionalBands): number {
  if (percent >= bands.L4) return 4;
  if (percent >= bands.L3) return 3;
  if (percent >= bands.L2) return 2;
  return 1;
}

/**
 * Demonstrated level (F12): the trainer's latest rating wins; otherwise a provisional level
 * from the average % of the linked assessments that have results; otherwise not assessed.
 */
export function demonstrated(
  rating: number | null,
  linkedPercents: readonly number[],
  bands: ProvisionalBands,
): { level: number | null; source: LevelSource } {
  if (rating !== null) return { level: rating, source: 'RATING' };
  if (linkedPercents.length === 0) return { level: null, source: 'NOT_ASSESSED' };
  const avg = linkedPercents.reduce((s, p) => s + p, 0) / linkedPercents.length;
  return { level: provisionalLevel(avg, bands), source: 'PROVISIONAL' };
}

/** BR-18: gap = required − demonstrated, never below 0. Not assessed counts as the full level. */
export function gap(required: number, demonstratedLevel: number | null): number {
  return Math.max(0, required - (demonstratedLevel ?? 0));
}

/** BR-13: a rating may be confirmed as verified only at or above the required level. */
export function canVerify(level: number, required: number): boolean {
  return level >= required;
}
