-- CreateEnum
CREATE TYPE "PlacementType" AS ENUM ('JOB', 'APPRENTICESHIP', 'INTERNSHIP', 'SELF_EMPLOYED', 'FURTHER_STUDY');

-- CreateTable
CREATE TABLE "placement_outcomes" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "opportunity_id" UUID,
    "type" "PlacementType" NOT NULL,
    "employer" TEXT NOT NULL,
    "role_title" TEXT NOT NULL,
    "placed_on" DATE NOT NULL,
    "monthly_income" DECIMAL(10,2),
    "notes" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "placement_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "placement_outcomes_enrollment_id_idx" ON "placement_outcomes"("enrollment_id");

-- CreateIndex
CREATE INDEX "placement_outcomes_opportunity_id_idx" ON "placement_outcomes"("opportunity_id");

-- CreateIndex
CREATE INDEX "placement_outcomes_recorded_by_id_idx" ON "placement_outcomes"("recorded_by_id");

-- AddForeignKey
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- F20 (BRQ-20.1–20.3): read-only outcome views, refreshed nightly (and on demand by an admin)
-- with REFRESH MATERIALIZED VIEW CONCURRENTLY, which needs the unique indexes below.
-- Raw counts only: rates and averages are computed on read so settings (e.g. whether LATE
-- counts as attended) apply without a refresh.

CREATE MATERIALIZED VIEW analytics_batch_outcomes AS
SELECT
  b.id AS batch_id,
  b.course_id,
  b.cycle_id,
  (SELECT COUNT(*) FROM batch_students bs WHERE bs.batch_id = b.id)::int AS students,
  (SELECT COUNT(*) FROM batch_students bs JOIN enrollments e ON e.id = bs.enrollment_id
     WHERE bs.batch_id = b.id AND e.status IN ('COMPLETED', 'CERTIFIED'))::int AS completed,
  (SELECT COUNT(*) FROM batch_students bs JOIN enrollments e ON e.id = bs.enrollment_id
     WHERE bs.batch_id = b.id AND e.status = 'NOT_COMPLETED')::int AS not_completed,
  (SELECT COUNT(*) FROM batch_students bs JOIN enrollments e ON e.id = bs.enrollment_id
     WHERE bs.batch_id = b.id AND e.status = 'CERTIFIED')::int AS certified,
  att.marks_total,
  att.marks_present,
  att.marks_late,
  sc.score_sum,
  sc.score_count,
  pl.placed
FROM batches b
LEFT JOIN LATERAL (
  SELECT COUNT(a.id)::int AS marks_total,
         COUNT(a.id) FILTER (WHERE a.status = 'PRESENT')::int AS marks_present,
         COUNT(a.id) FILTER (WHERE a.status = 'LATE')::int AS marks_late
  FROM training_sessions ts
  JOIN attendance a ON a.session_id = ts.id
  WHERE ts.batch_id = b.id AND ts.status = 'CONDUCTED'
) att ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(ar.marks * 100.0 / NULLIF(asm.max_marks, 0)), 0)::float8 AS score_sum,
         COUNT(ar.id)::int AS score_count
  FROM assessments asm
  JOIN assessment_results ar ON ar.assessment_id = asm.id
  WHERE asm.batch_id = b.id
) sc ON true
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT po.enrollment_id)::int AS placed
  FROM placement_outcomes po
  JOIN batch_students bs ON bs.enrollment_id = po.enrollment_id
  WHERE bs.batch_id = b.id
) pl ON true;

CREATE UNIQUE INDEX analytics_batch_outcomes_batch_id ON analytics_batch_outcomes (batch_id);
CREATE INDEX analytics_batch_outcomes_cycle_id ON analytics_batch_outcomes (cycle_id);

-- Competency achievement per course and cycle (BRQ-20.2): verified (student, competency)
-- pairs, not revoked, against students × competencies of the course.
CREATE MATERIALIZED VIEW analytics_course_competency AS
SELECT
  b.course_id,
  b.cycle_id,
  COUNT(DISTINCT bs.student_id)::int AS students,
  (SELECT COUNT(*) FROM competencies k WHERE k.course_id = b.course_id)::int AS competencies,
  COUNT(DISTINCT (r.student_id, r.competency_id))
    FILTER (WHERE r.verified_at IS NOT NULL AND r.revoked_at IS NULL)::int AS verified
FROM batches b
JOIN batch_students bs ON bs.batch_id = b.id
LEFT JOIN competency_ratings r ON r.batch_id = b.id AND r.student_id = bs.student_id
GROUP BY b.course_id, b.cycle_id;

CREATE UNIQUE INDEX analytics_course_competency_course_cycle
  ON analytics_course_competency (course_id, cycle_id);
