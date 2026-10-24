-- CreateTable
CREATE TABLE "job_locks" (
    "name" TEXT NOT NULL,
    "run_id" UUID NOT NULL,
    "locked_until" TIMESTAMPTZ(3) NOT NULL,
    "last_run_at" TIMESTAMPTZ(3),
    "last_result" JSONB,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("name")
);
