import type { OutcomeFigures } from '@vtmp/shared';

/** part ÷ whole × 100 to two decimals; null when there is nothing to divide by. */
export function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part * 10_000) / whole) / 100;
}

/** Raw counts from the analytics views for one batch, or several added together. */
export interface OutcomeCounts {
  students: number;
  completed: number;
  notCompleted: number;
  certified: number;
  marksTotal: number;
  marksPresent: number;
  marksLate: number;
  scoreSum: number;
  scoreCount: number;
  placed: number;
}

export const emptyCounts = (): OutcomeCounts => ({
  students: 0,
  completed: 0,
  notCompleted: 0,
  certified: 0,
  marksTotal: 0,
  marksPresent: 0,
  marksLate: 0,
  scoreSum: 0,
  scoreCount: 0,
  placed: 0,
});

export function addCounts(a: OutcomeCounts, b: OutcomeCounts): OutcomeCounts {
  const out = { ...a };
  for (const k of Object.keys(out) as Array<keyof OutcomeCounts>) out[k] = a[k] + b[k];
  return out;
}

/**
 * BRQ-20.1, 20.3 from raw counts. Completion rate counts only students who have finished
 * (completed + not completed), so batches still in training don't drag it down. Attendance
 * pools all marks; LATE counts as attended when the BR-08 setting says so. Average score is the
 * mean result as a % of its maximum. Placement rate is placed ÷ completed.
 */
export function figures(c: OutcomeCounts, lateCountsAsPresent: boolean): OutcomeFigures {
  const attended = c.marksPresent + (lateCountsAsPresent ? c.marksLate : 0);
  return {
    students: c.students,
    completed: c.completed,
    notCompleted: c.notCompleted,
    certified: c.certified,
    completionRate: rate(c.completed, c.completed + c.notCompleted),
    averageScore: c.scoreCount > 0 ? Math.round((c.scoreSum / c.scoreCount) * 100) / 100 : null,
    attendanceRate: rate(attended, c.marksTotal),
    placed: c.placed,
    placementRate: rate(c.placed, c.completed),
  };
}
