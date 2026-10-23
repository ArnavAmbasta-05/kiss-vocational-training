/**
 * Completion rate (BRQ-8.2, BRQ-9.2): completed ÷ (completed + not completed), to two decimals.
 * Students still in training are left out, so an unfinished batch isn't shown as failing.
 * Null until anyone has finished.
 */
export function completionRate(completed: number, notCompleted: number): number | null {
  const finished = completed + notCompleted;
  return finished === 0 ? null : Math.round((completed * 10_000) / finished) / 100;
}
