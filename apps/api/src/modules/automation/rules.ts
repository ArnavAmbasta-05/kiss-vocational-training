/** Pure rules for the daily automation run (Round 2 review A1–A9). */

const DAY_MS = 86_400_000;

/**
 * Notices that fire once (a window opening, a link nearing expiry, a placement follow-up) cover
 * the time since the last successful run, so a missed night is caught up and nothing is sent
 * twice. The first run ever looks back one day.
 */
export function noticeWindowStart(lastSuccessAt: Date | null, now: Date): Date {
  return lastSuccessAt ?? new Date(now.getTime() - DAY_MS);
}

/** YYYY-MM-DD `days` calendar days before `day`. */
export function daysBefore(day: string, days: number): string {
  return new Date(Date.parse(day) - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A1 (BR-25): ended batches that the run closes: nobody left undecided, and the end date is at
 * least `graceDays` days past, so the admin still has time to revisit a decision first.
 */
export function readyToClose<T extends { endDate: string; undecided: number }>(
  ended: readonly T[],
  today: string,
  graceDays: number,
): T[] {
  const cutoff = daysBefore(today, graceDays);
  return ended.filter((b) => b.undecided === 0 && b.endDate <= cutoff);
}

/** A8: refresh analytics after a certificate when the last refresh is older than the limit. */
export function analyticsStale(lastSuccessAt: Date | null, now: Date, minutes: number): boolean {
  return !lastSuccessAt || now.getTime() - lastSuccessAt.getTime() >= minutes * 60_000;
}
