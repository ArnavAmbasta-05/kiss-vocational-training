-- BR-01: a withdrawn application no longer counts as the student's active enrollment for the
-- cycle, so they may apply again. Separate migration: Postgres cannot use an enum value in the
-- same transaction that added it.
DROP INDEX "enrollments_one_active_per_cycle";
CREATE UNIQUE INDEX "enrollments_one_active_per_cycle"
  ON "enrollments" ("student_id", "cycle_id")
  WHERE "status" NOT IN ('REJECTED', 'NOT_COMPLETED', 'WITHDRAWN');
