-- Sprint 13 (TAD §8.2): when each scheduled job last succeeded, so the next run can report
-- missed days and catch up.
ALTER TABLE "job_locks" ADD COLUMN "last_success_at" TIMESTAMPTZ(3);
