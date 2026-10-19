import type { EnrollmentStatus, ReviewAction } from '@vtmp/shared';

export const REVIEW_TARGET: Record<ReviewAction, EnrollmentStatus> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  WAITLIST: 'WAITLISTED',
};

/**
 * Admin review transitions (BRQ-3.3). A pending application can go anywhere; a waitlisted one
 * can be approved or rejected later. Everything else is already decided or past review.
 */
const ALLOWED: Partial<Record<EnrollmentStatus, ReviewAction[]>> = {
  PENDING: ['APPROVE', 'REJECT', 'WAITLIST'],
  WAITLISTED: ['APPROVE', 'REJECT'],
};

export function canReview(from: EnrollmentStatus, action: ReviewAction): boolean {
  return ALLOWED[from]?.includes(action) ?? false;
}

/**
 * Preference count against the configured limit (setting enrollment.maxPreferences, ≤ 3).
 * Distinctness and the hard 1–3 bounds are checked by the shared Zod schema.
 */
export function preferenceCountProblem(courseIds: readonly string[], max: number): string | null {
  if (courseIds.length === 0) return 'Choose at least one course';
  if (courseIds.length > max) return `Choose at most ${max} course${max === 1 ? '' : 's'}`;
  return null;
}

/** A student may edit or withdraw only while PENDING and every chosen course's window is open. */
export function isEditable(status: EnrollmentStatus, allWindowsOpen: boolean): boolean {
  return status === 'PENDING' && allWindowsOpen;
}
