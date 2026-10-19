import { BulkReviewSchema, PreferencesSchema, type EnrollmentStatus } from '@vtmp/shared';
import { canReview, isEditable, preferenceCountProblem } from '../rules';

const a = '6f1c2a3e-1b2c-4d5e-8f90-123456789a01';
const b = '6f1c2a3e-1b2c-4d5e-8f90-123456789a02';
const c = '6f1c2a3e-1b2c-4d5e-8f90-123456789a03';
const d = '6f1c2a3e-1b2c-4d5e-8f90-123456789a04';

describe('preference validation (BRQ-3.1)', () => {
  it('accepts 1–3 distinct courses', () => {
    expect(PreferencesSchema.safeParse([a]).success).toBe(true);
    expect(PreferencesSchema.safeParse([a, b, c]).success).toBe(true);
  });

  it('rejects none, more than three, and duplicates', () => {
    expect(PreferencesSchema.safeParse([]).success).toBe(false);
    expect(PreferencesSchema.safeParse([a, b, c, d]).success).toBe(false);
    expect(PreferencesSchema.safeParse([a, b, a]).success).toBe(false);
  });

  it('honours a lower configured limit (enrollment.maxPreferences)', () => {
    expect(preferenceCountProblem([a, b], 2)).toBeNull();
    expect(preferenceCountProblem([a, b, c], 2)).toMatch(/at most 2/);
    expect(preferenceCountProblem([a, b], 1)).toMatch(/at most 1 course$/);
  });
});

describe('review transitions (BRQ-3.3)', () => {
  const statuses: EnrollmentStatus[] = [
    'PENDING',
    'APPROVED',
    'REJECTED',
    'WAITLISTED',
    'ALLOCATED',
    'ACTIVE',
    'COMPLETED',
    'NOT_COMPLETED',
    'CERTIFIED',
    'WITHDRAWN',
  ];

  it('lets pending go anywhere and waitlisted be approved or rejected', () => {
    expect(canReview('PENDING', 'APPROVE')).toBe(true);
    expect(canReview('PENDING', 'REJECT')).toBe(true);
    expect(canReview('PENDING', 'WAITLIST')).toBe(true);
    expect(canReview('WAITLISTED', 'APPROVE')).toBe(true);
    expect(canReview('WAITLISTED', 'REJECT')).toBe(true);
    expect(canReview('WAITLISTED', 'WAITLIST')).toBe(false);
  });

  it('refuses every action on decided or later statuses', () => {
    for (const s of statuses.filter((x) => x !== 'PENDING' && x !== 'WAITLISTED')) {
      for (const action of ['APPROVE', 'REJECT', 'WAITLIST'] as const) {
        expect(canReview(s, action)).toBe(false);
      }
    }
  });

  it('requires a reason to reject in bulk', () => {
    expect(BulkReviewSchema.safeParse({ ids: [a], action: 'REJECT' }).success).toBe(false);
    expect(
      BulkReviewSchema.safeParse({ ids: [a], action: 'REJECT', reason: 'Prerequisite missing' })
        .success,
    ).toBe(true);
    expect(BulkReviewSchema.safeParse({ ids: [a, a], action: 'APPROVE' }).success).toBe(false);
  });
});

describe('isEditable', () => {
  it('only while pending and every window is open', () => {
    expect(isEditable('PENDING', true)).toBe(true);
    expect(isEditable('PENDING', false)).toBe(false);
    expect(isEditable('APPROVED', true)).toBe(false);
  });
});
