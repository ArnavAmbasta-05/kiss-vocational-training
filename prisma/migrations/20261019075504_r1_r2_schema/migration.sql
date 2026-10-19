/*
  Warnings:

  - Added the required column `full_name` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WAITLISTED', 'ALLOCATED', 'ACTIVE', 'COMPLETED', 'NOT_COMPLETED', 'CERTIFIED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'CONDUCTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');

-- CreateEnum
CREATE TYPE "AssessmentMode" AS ENUM ('THEORY', 'PRACTICAL');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('VALID', 'REVOKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('A', 'B', 'C', 'D', 'NOT_COMPLETED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "InterventionActionType" AS ENUM ('COUNSELLING', 'EXTRA_SESSION', 'PRACTICE_TASK');

-- CreateEnum
CREATE TYPE "LearningResourceType" AS ENUM ('VIDEO', 'DOCUMENT', 'PRACTICE_TASK', 'REMEDIAL_SESSION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "full_name" TEXT NOT NULL,
ADD COLUMN     "last_login_at" TIMESTAMPTZ(3),
ADD COLUMN     "locked_until" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "roll_no" TEXT NOT NULL,
    "cgpa" DECIMAL(4,2) NOT NULL,
    "phone" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "phone" TEXT,
    "specialization" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration_weeks" INTEGER NOT NULL,
    "prerequisites" TEXT,
    "seat_capacity" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_cycles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "training_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_offerings" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "enrollment_opens_at" TIMESTAMPTZ(3) NOT NULL,
    "enrollment_closes_at" TIMESTAMPTZ(3) NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_preferences" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "enrollment_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "venue" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_students" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "allocated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_assignments" (
    "batch_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_assignments_pkey" PRIMARY KEY ("batch_id","trainer_id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "trainer_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "topic" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "marked_by_id" UUID NOT NULL,
    "first_marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "student_id" UUID,
    "milestone" TEXT NOT NULL,
    "note" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "AssessmentMode" NOT NULL,
    "max_marks" DECIMAL(6,2) NOT NULL,
    "weightage" DECIMAL(6,2) NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "held_on" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "marks" DECIMAL(6,2) NOT NULL,
    "remarks" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "remarks" TEXT NOT NULL,
    "recommended" BOOLEAN NOT NULL,
    "evaluated_by_id" UUID NOT NULL,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "public_code" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'VALID',
    "grade" "Grade" NOT NULL,
    "aggregate_percent" DECIMAL(5,2) NOT NULL,
    "attendance_percent" DECIMAL(5,2) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,
    "superseded_by_id" UUID,
    "verification_count" INTEGER NOT NULL DEFAULT 0,
    "pdf_object_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reports" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdf_object_key" TEXT,
    "generated_by_id" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "competencies" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" "AssessmentMode" NOT NULL,
    "required_level" INTEGER NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_competencies" (
    "assessment_id" UUID NOT NULL,
    "competency_id" UUID NOT NULL,

    CONSTRAINT "assessment_competencies_pkey" PRIMARY KEY ("assessment_id","competency_id")
);

-- CreateTable
CREATE TABLE "competency_ratings" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "competency_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "rated_by_id" UUID NOT NULL,
    "rated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(3),
    "verified_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoked_reason" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "competency_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_resources" (
    "id" UUID NOT NULL,
    "competency_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "LearningResourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passport_shares" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMPTZ(3),

    CONSTRAINT "passport_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_flags" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "reasons" JSONB NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clear_since" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "escalated_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_actions" (
    "id" UUID NOT NULL,
    "flag_id" UUID NOT NULL,
    "type" "InterventionActionType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "note" TEXT,
    "outcome" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "intervention_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "refresh_tokens"("replaced_by_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_roll_no_key" ON "students"("roll_no");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_user_id_key" ON "trainers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_employee_code_key" ON "trainers"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_is_active_idx" ON "courses"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "training_cycles_name_key" ON "training_cycles"("name");

-- CreateIndex
CREATE INDEX "course_offerings_cycle_id_idx" ON "course_offerings"("cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_offerings_course_id_cycle_id_key" ON "course_offerings"("course_id", "cycle_id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE INDEX "enrollments_cycle_id_status_idx" ON "enrollments"("cycle_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_decided_by_id_idx" ON "enrollments"("decided_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_id_student_id_key" ON "enrollments"("id", "student_id");

-- CreateIndex
CREATE INDEX "enrollment_preferences_course_id_idx" ON "enrollment_preferences"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_preferences_enrollment_id_rank_key" ON "enrollment_preferences"("enrollment_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_preferences_enrollment_id_course_id_key" ON "enrollment_preferences"("enrollment_id", "course_id");

-- CreateIndex
CREATE INDEX "batches_cycle_id_status_idx" ON "batches"("cycle_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "batches_course_id_cycle_id_name_key" ON "batches"("course_id", "cycle_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "batch_students_enrollment_id_key" ON "batch_students"("enrollment_id");

-- CreateIndex
CREATE INDEX "batch_students_student_id_idx" ON "batch_students"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "batch_students_batch_id_student_id_key" ON "batch_students"("batch_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "batch_students_enrollment_id_student_id_key" ON "batch_students"("enrollment_id", "student_id");

-- CreateIndex
CREATE INDEX "trainer_assignments_trainer_id_idx" ON "trainer_assignments"("trainer_id");

-- CreateIndex
CREATE INDEX "training_sessions_batch_id_starts_at_idx" ON "training_sessions"("batch_id", "starts_at");

-- CreateIndex
CREATE INDEX "training_sessions_trainer_id_starts_at_idx" ON "training_sessions"("trainer_id", "starts_at");

-- CreateIndex
CREATE INDEX "training_sessions_venue_starts_at_idx" ON "training_sessions"("venue", "starts_at");

-- CreateIndex
CREATE INDEX "attendance_student_id_session_id_idx" ON "attendance"("student_id", "session_id");

-- CreateIndex
CREATE INDEX "attendance_marked_by_id_idx" ON "attendance"("marked_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_session_id_student_id_key" ON "attendance"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "progress_batch_id_idx" ON "progress"("batch_id");

-- CreateIndex
CREATE INDEX "progress_student_id_idx" ON "progress"("student_id");

-- CreateIndex
CREATE INDEX "progress_recorded_by_id_idx" ON "progress"("recorded_by_id");

-- CreateIndex
CREATE INDEX "assessments_batch_id_idx" ON "assessments"("batch_id");

-- CreateIndex
CREATE INDEX "assessments_created_by_id_idx" ON "assessments"("created_by_id");

-- CreateIndex
CREATE INDEX "assessment_results_student_id_idx" ON "assessment_results"("student_id");

-- CreateIndex
CREATE INDEX "assessment_results_recorded_by_id_idx" ON "assessment_results"("recorded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_assessment_id_student_id_key" ON "assessment_results"("assessment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_enrollment_id_key" ON "evaluations"("enrollment_id");

-- CreateIndex
CREATE INDEX "evaluations_evaluated_by_id_idx" ON "evaluations"("evaluated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_public_code_key" ON "certificates"("public_code");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_superseded_by_id_key" ON "certificates"("superseded_by_id");

-- CreateIndex
CREATE INDEX "certificates_enrollment_id_idx" ON "certificates"("enrollment_id");

-- CreateIndex
CREATE INDEX "certificates_status_idx" ON "certificates"("status");

-- CreateIndex
CREATE INDEX "certificates_issued_by_id_idx" ON "certificates"("issued_by_id");

-- CreateIndex
CREATE INDEX "performance_reports_enrollment_id_idx" ON "performance_reports"("enrollment_id");

-- CreateIndex
CREATE INDEX "performance_reports_generated_by_id_idx" ON "performance_reports"("generated_by_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_key_key" ON "idempotency_keys"("user_id", "key");

-- CreateIndex
CREATE INDEX "settings_updated_by_id_idx" ON "settings"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "competencies_course_id_code_key" ON "competencies"("course_id", "code");

-- CreateIndex
CREATE INDEX "assessment_competencies_competency_id_idx" ON "assessment_competencies"("competency_id");

-- CreateIndex
CREATE INDEX "competency_ratings_competency_id_idx" ON "competency_ratings"("competency_id");

-- CreateIndex
CREATE INDEX "competency_ratings_batch_id_idx" ON "competency_ratings"("batch_id");

-- CreateIndex
CREATE INDEX "competency_ratings_rated_by_id_idx" ON "competency_ratings"("rated_by_id");

-- CreateIndex
CREATE INDEX "competency_ratings_verified_by_id_idx" ON "competency_ratings"("verified_by_id");

-- CreateIndex
CREATE INDEX "competency_ratings_revoked_by_id_idx" ON "competency_ratings"("revoked_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "competency_ratings_student_id_competency_id_batch_id_key" ON "competency_ratings"("student_id", "competency_id", "batch_id");

-- CreateIndex
CREATE INDEX "learning_resources_competency_id_idx" ON "learning_resources"("competency_id");

-- CreateIndex
CREATE INDEX "learning_resources_created_by_id_idx" ON "learning_resources"("created_by_id");

-- CreateIndex
CREATE INDEX "learning_resources_approved_by_id_idx" ON "learning_resources"("approved_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "passport_shares_token_hash_key" ON "passport_shares"("token_hash");

-- CreateIndex
CREATE INDEX "passport_shares_student_id_idx" ON "passport_shares"("student_id");

-- CreateIndex
CREATE INDEX "risk_flags_student_id_idx" ON "risk_flags"("student_id");

-- CreateIndex
CREATE INDEX "risk_flags_batch_id_level_idx" ON "risk_flags"("batch_id", "level");

-- CreateIndex
CREATE INDEX "intervention_actions_flag_id_idx" ON "intervention_actions"("flag_id");

-- CreateIndex
CREATE INDEX "intervention_actions_owner_id_idx" ON "intervention_actions"("owner_id");

-- CreateIndex
CREATE INDEX "intervention_actions_created_by_id_idx" ON "intervention_actions"("created_by_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "training_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "training_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_preferences" ADD CONSTRAINT "enrollment_preferences_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_preferences" ADD CONSTRAINT "enrollment_preferences_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "training_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_enrollment_id_student_id_fkey" FOREIGN KEY ("enrollment_id", "student_id") REFERENCES "enrollments"("id", "student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_assignments" ADD CONSTRAINT "trainer_assignments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_assignments" ADD CONSTRAINT "trainer_assignments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress" ADD CONSTRAINT "progress_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress" ADD CONSTRAINT "progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress" ADD CONSTRAINT "progress_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluated_by_id_fkey" FOREIGN KEY ("evaluated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reports" ADD CONSTRAINT "performance_reports_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reports" ADD CONSTRAINT "performance_reports_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_competencies" ADD CONSTRAINT "assessment_competencies_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_competencies" ADD CONSTRAINT "assessment_competencies_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_rated_by_id_fkey" FOREIGN KEY ("rated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_shares" ADD CONSTRAINT "passport_shares_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_actions" ADD CONSTRAINT "intervention_actions_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "risk_flags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_actions" ADD CONSTRAINT "intervention_actions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_actions" ADD CONSTRAINT "intervention_actions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════════
-- Hand-written constraints Prisma cannot express (TAD §6.3). Keep in sync with docs/ER.md.
-- ════════════════════════════════════════════════════════════════════════════════

-- ── CHECK constraints ───────────────────────────────────────────────────────────
ALTER TABLE "students" ADD CONSTRAINT "students_cgpa_range" CHECK ("cgpa" >= 0 AND "cgpa" <= 10);
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_count_nonneg" CHECK ("failed_login_count" >= 0);

ALTER TABLE "courses" ADD CONSTRAINT "courses_duration_positive" CHECK ("duration_weeks" > 0);
ALTER TABLE "courses" ADD CONSTRAINT "courses_seat_capacity_positive" CHECK ("seat_capacity" > 0);

ALTER TABLE "training_cycles" ADD CONSTRAINT "training_cycles_dates_ordered" CHECK ("ends_on" >= "starts_on");
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_window_ordered"
  CHECK ("enrollment_closes_at" > "enrollment_opens_at");

ALTER TABLE "enrollment_preferences" ADD CONSTRAINT "enrollment_preferences_rank_range"
  CHECK ("rank" BETWEEN 1 AND 3);

ALTER TABLE "batches" ADD CONSTRAINT "batches_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "batches" ADD CONSTRAINT "batches_dates_ordered" CHECK ("end_date" >= "start_date");

ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_times_ordered" CHECK ("ends_at" > "starts_at");

ALTER TABLE "assessments" ADD CONSTRAINT "assessments_max_marks_positive" CHECK ("max_marks" > 0);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_weightage_positive" CHECK ("weightage" > 0);
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_marks_nonneg" CHECK ("marks" >= 0);

ALTER TABLE "certificates" ADD CONSTRAINT "certificates_public_code_length" CHECK (char_length("public_code") >= 12);
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_grade_passing" CHECK ("grade" <> 'NOT_COMPLETED');
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_percent_range"
  CHECK ("aggregate_percent" BETWEEN 0 AND 100 AND "attendance_percent" BETWEEN 0 AND 100);
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_verification_count_nonneg" CHECK ("verification_count" >= 0);
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revoked_has_reason"
  CHECK ("status" <> 'REVOKED' OR ("revoked_at" IS NOT NULL AND "revoked_reason" IS NOT NULL));

ALTER TABLE "competencies" ADD CONSTRAINT "competencies_required_level_range" CHECK ("required_level" BETWEEN 1 AND 4);
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_level_range" CHECK ("level" BETWEEN 1 AND 4);
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_revoked_has_reason"
  CHECK ("revoked_at" IS NULL OR "revoked_reason" IS NOT NULL);

ALTER TABLE "intervention_actions" ADD CONSTRAINT "intervention_actions_due_after_created"
  CHECK ("due_on" >= ("created_at" AT TIME ZONE 'UTC')::date);

-- ── BR-07: 0 <= marks <= assessment.max_marks ───────────────────────────────────
CREATE FUNCTION enforce_marks_within_max() RETURNS trigger AS $$
DECLARE
  max_allowed NUMERIC;
BEGIN
  SELECT "max_marks" INTO max_allowed FROM "assessments" WHERE "id" = NEW."assessment_id";
  IF NEW."marks" > max_allowed THEN
    RAISE EXCEPTION 'marks % exceed max_marks % for assessment %', NEW."marks", max_allowed, NEW."assessment_id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'assessment_results_marks_within_max';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assessment_results_marks_within_max"
  BEFORE INSERT OR UPDATE OF "marks", "assessment_id" ON "assessment_results"
  FOR EACH ROW EXECUTE FUNCTION enforce_marks_within_max();

-- Lowering max_marks below an existing result would silently break BR-07; block it too.
CREATE FUNCTION enforce_max_marks_covers_results() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "assessment_results" WHERE "assessment_id" = NEW."id" AND "marks" > NEW."max_marks") THEN
    RAISE EXCEPTION 'max_marks % is below an existing result for assessment %', NEW."max_marks", NEW."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'assessment_results_marks_within_max';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assessments_max_marks_covers_results"
  BEFORE UPDATE OF "max_marks" ON "assessments"
  FOR EACH ROW EXECUTE FUNCTION enforce_max_marks_covers_results();

-- ── Partial unique indexes ──────────────────────────────────────────────────────
-- BR-01: one active enrollment per student per cycle.
CREATE UNIQUE INDEX "enrollments_one_active_per_cycle"
  ON "enrollments" ("student_id", "cycle_id")
  WHERE "status" NOT IN ('REJECTED', 'NOT_COMPLETED');

-- F11: one open risk flag per student per batch.
CREATE UNIQUE INDEX "risk_flags_one_open_per_student_batch"
  ON "risk_flags" ("student_id", "batch_id")
  WHERE "closed_at" IS NULL;

-- F15: at most one VALID certificate per enrollment (reissue supersedes the old one).
CREATE UNIQUE INDEX "certificates_one_valid_per_enrollment"
  ON "certificates" ("enrollment_id")
  WHERE "status" = 'VALID';

-- ── NFR-06: audit log is insert-only ────────────────────────────────────────────
CREATE FUNCTION reject_audit_log_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is insert-only (% blocked)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_change();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_log_change();
