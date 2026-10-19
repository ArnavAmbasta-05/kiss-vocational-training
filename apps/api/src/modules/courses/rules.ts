import type { WindowState } from '@vtmp/shared';

export interface WindowFacts {
  isOpen: boolean;
  enrollmentOpensAt: Date;
  enrollmentClosesAt: Date;
}

/**
 * BR-02 / BRQ-2.3: a course accepts applications only while the admin toggle is on AND now is
 * inside [opensAt, closesAt). Closing time is exclusive, so 23:59:59.999 is open and the closing
 * instant itself is closed.
 */
export function windowState(offering: WindowFacts | null | undefined, now: Date): WindowState {
  if (!offering) return 'NOT_OFFERED';
  if (!offering.isOpen) return 'CLOSED';
  if (now < offering.enrollmentOpensAt) return 'UPCOMING';
  if (now >= offering.enrollmentClosesAt) return 'CLOSED';
  return 'OPEN';
}

export function isWindowOpen(offering: WindowFacts | null | undefined, now: Date): boolean {
  return windowState(offering, now) === 'OPEN';
}
