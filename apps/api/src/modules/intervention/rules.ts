import type { RiskLevel, RiskReason } from '@vtmp/shared';

export interface RiskFacts {
  /** Two decimals (BR-08); null when no session has been conducted. */
  attendancePercent: number | null;
  consecutiveAbsences: number;
  /** Result percentages in the order the assessments were held, oldest first. */
  assessmentPercents: readonly number[];
  /** Weighted aggregate over recorded assessments; null when nothing is recorded. */
  projectedAggregate: number | null;
  /** Assessed mandatory competencies below their required level (BR-18). */
  mandatoryGaps: ReadonlyArray<{ title: string; requiredLevel: number; gap: number }>;
}

/** BR-16 thresholds, read from the Setting table (`risk.*`). */
export interface RiskThresholds {
  mediumAttendanceBelow: number;
  mediumConsecutiveAbsences: number;
  mediumAssessmentBelow: number;
  highAttendanceBelow: number;
  highProjectedBelow: number;
  highDropPoints: number;
}

/**
 * BR-16 / BR-18: Medium if attendance < 80 %, ≥ 3 consecutive absences or the latest assessment
 * < 50 %; High if attendance < 75 %, projected aggregate < 40 %, a drop of ≥ 15 points from the
 * previous assessment to the latest, or an assessed mandatory competency below its required
 * level. "Below" is strict, so 75.00 is not High and 80.00 is Low. Only the latest result
 * counts for the assessment rules, so an old low mark can't keep a recovering student flagged.
 * Every reason is reported; the level is the worst of them.
 */
export function riskLevel(
  facts: RiskFacts,
  t: RiskThresholds,
): { level: RiskLevel; reasons: RiskReason[] } {
  const reasons: RiskReason[] = [];
  const att = facts.attendancePercent;

  if (att !== null && att < t.highAttendanceBelow) {
    reasons.push({
      code: 'ATTENDANCE_BELOW_HIGH',
      level: 'HIGH',
      actual: att,
      threshold: t.highAttendanceBelow,
    });
  } else if (att !== null && att < t.mediumAttendanceBelow) {
    reasons.push({
      code: 'ATTENDANCE_BELOW_MEDIUM',
      level: 'MEDIUM',
      actual: att,
      threshold: t.mediumAttendanceBelow,
    });
  }

  if (facts.consecutiveAbsences >= t.mediumConsecutiveAbsences) {
    reasons.push({
      code: 'CONSECUTIVE_ABSENCES',
      level: 'MEDIUM',
      actual: facts.consecutiveAbsences,
      threshold: t.mediumConsecutiveAbsences,
    });
  }

  const scores = facts.assessmentPercents;
  const latest = scores.at(-1);
  const previous = scores.at(-2);
  if (latest !== undefined && latest < t.mediumAssessmentBelow) {
    reasons.push({
      code: 'ASSESSMENT_BELOW',
      level: 'MEDIUM',
      actual: latest,
      threshold: t.mediumAssessmentBelow,
    });
  }
  if (latest !== undefined && previous !== undefined) {
    // Integer hundredths so 15.00 points is exactly 15, never 14.999999.
    const drop = (Math.round(previous * 100) - Math.round(latest * 100)) / 100;
    if (drop >= t.highDropPoints) {
      reasons.push({
        code: 'SCORE_DROP',
        level: 'HIGH',
        actual: drop,
        threshold: t.highDropPoints,
      });
    }
  }

  if (facts.projectedAggregate !== null && facts.projectedAggregate < t.highProjectedBelow) {
    reasons.push({
      code: 'PROJECTED_BELOW',
      level: 'HIGH',
      actual: facts.projectedAggregate,
      threshold: t.highProjectedBelow,
    });
  }

  for (const g of facts.mandatoryGaps) {
    if (g.gap <= 0) continue;
    reasons.push({
      code: 'MANDATORY_GAP',
      level: 'HIGH',
      actual: g.gap,
      threshold: g.requiredLevel,
      competency: g.title,
    });
  }

  const level: RiskLevel = reasons.some((r) => r.level === 'HIGH')
    ? 'HIGH'
    : reasons.length
      ? 'MEDIUM'
      : 'LOW';
  return { level, reasons };
}

/** Same level and the same reasons (codes and figures), regardless of order. */
export function sameRisk(
  a: { level: RiskLevel; reasons: readonly RiskReason[] },
  b: { level: RiskLevel; reasons: readonly RiskReason[] },
): boolean {
  if (a.level !== b.level || a.reasons.length !== b.reasons.length) return false;
  const key = (r: RiskReason) => `${r.code}|${r.actual}|${r.threshold}|${r.competency ?? ''}`;
  const left = a.reasons.map(key).sort();
  const right = b.reasons.map(key).sort();
  return left.every((k, i) => k === right[i]);
}

export type FlagStep =
  | { kind: 'none' }
  | { kind: 'open' }
  | { kind: 'update' }
  | { kind: 'clearing' }
  | { kind: 'close' };

const DAY_MS = 86_400_000;

/**
 * BR-17 lifecycle for one student in one batch, given today's level and their open flag (if
 * any): open a flag when at risk without one; update it when the level or reasons change (or
 * it was clearing and the risk is back); start the clear period when everything clears; close
 * it once triggers have stayed clear for `closeAfterClearDays` whole days.
 */
export function flagStep(
  current: { level: RiskLevel; reasons: readonly RiskReason[] },
  open: { level: RiskLevel; reasons: readonly RiskReason[]; clearSince: Date | null } | null,
  now: Date,
  closeAfterClearDays: number,
): FlagStep {
  if (current.level !== 'LOW') {
    if (!open) return { kind: 'open' };
    return open.clearSince || !sameRisk(current, open) ? { kind: 'update' } : { kind: 'none' };
  }
  if (!open) return { kind: 'none' };
  if (!open.clearSince) return { kind: 'clearing' };
  return now.getTime() - open.clearSince.getTime() >= closeAfterClearDays * DAY_MS
    ? { kind: 'close' }
    : { kind: 'none' };
}

/** BR-17: an open High flag escalates once it has been open `escalateAfterDays` whole days. */
export function shouldEscalate(
  flag: { level: RiskLevel; openedAt: Date; escalatedAt: Date | null; clearSince: Date | null },
  now: Date,
  escalateAfterDays: number,
): boolean {
  return (
    flag.level === 'HIGH' &&
    flag.escalatedAt === null &&
    flag.clearSince === null &&
    now.getTime() - flag.openedAt.getTime() >= escalateAfterDays * DAY_MS
  );
}

/**
 * Order of batches for the daily run: those a partial run left over first (catch-up, in their
 * old order), then the rest shuffled so that a run cut short by its time budget doesn't always
 * miss the same batches. Left-over ids no longer ACTIVE are dropped.
 */
export function runOrder(active: string[], leftOver: string[], random: () => number): string[] {
  const live = new Set(active);
  const first = leftOver.filter((id, i) => live.has(id) && leftOver.indexOf(id) === i);
  const firstSet = new Set(first);
  const rest = active
    .filter((id) => !firstSet.has(id))
    .map((id) => ({ id, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.id);
  return [...first, ...rest];
}

/**
 * BR-16 applies to students still in training. Once a student completes, is certified, does
 * not complete or withdraws, there is nothing left to intervene on: their open flag closes.
 */
export function inTraining(status: string | undefined): boolean {
  return status === 'ALLOCATED' || status === 'ACTIVE';
}
