-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('INTERNSHIP', 'APPRENTICESHIP', 'JOB');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('FILE', 'LINK');

-- CreateTable
CREATE TABLE "rubrics" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "criteria" JSONB NOT NULL,
    "levels" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practical_evidence" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "competency_id" UUID,
    "kind" "EvidenceKind" NOT NULL,
    "object_key" TEXT,
    "url" TEXT,
    "file_name" TEXT,
    "mime" TEXT,
    "size_bytes" INTEGER,
    "scores" JSONB,
    "note" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practical_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_roles" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_role_competencies" (
    "role_id" UUID NOT NULL,
    "competency_code" TEXT NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "job_role_competencies_pkey" PRIMARY KEY ("role_id","competency_code")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "OpportunityType" NOT NULL,
    "partner" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "closes_on" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_interests" (
    "opportunity_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_interests_pkey" PRIMARY KEY ("opportunity_id","student_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubrics_assessment_id_key" ON "rubrics"("assessment_id");

-- CreateIndex
CREATE INDEX "rubrics_created_by_id_idx" ON "rubrics"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "practical_evidence_object_key_key" ON "practical_evidence"("object_key");

-- CreateIndex
CREATE INDEX "practical_evidence_result_id_idx" ON "practical_evidence"("result_id");

-- CreateIndex
CREATE INDEX "practical_evidence_competency_id_idx" ON "practical_evidence"("competency_id");

-- CreateIndex
CREATE INDEX "practical_evidence_uploaded_by_id_idx" ON "practical_evidence"("uploaded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_roles_title_key" ON "job_roles"("title");

-- CreateIndex
CREATE INDEX "opportunities_role_id_idx" ON "opportunities"("role_id");

-- CreateIndex
CREATE INDEX "opportunities_closes_on_idx" ON "opportunities"("closes_on");

-- CreateIndex
CREATE INDEX "opportunities_created_by_id_idx" ON "opportunities"("created_by_id");

-- CreateIndex
CREATE INDEX "opportunity_interests_student_id_idx" ON "opportunity_interests"("student_id");

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_evidence" ADD CONSTRAINT "practical_evidence_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "assessment_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_evidence" ADD CONSTRAINT "practical_evidence_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_evidence" ADD CONSTRAINT "practical_evidence_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_role_competencies" ADD CONSTRAINT "job_role_competencies_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "job_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_interests" ADD CONSTRAINT "opportunity_interests_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_interests" ADD CONSTRAINT "opportunity_interests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business constraints (TAD §6.2): levels 1–4, evidence is either a stored file (≤ 10 MB) or a
-- link, never both.
ALTER TABLE "job_role_competencies"
  ADD CONSTRAINT "job_role_competencies_level_range" CHECK ("level" BETWEEN 1 AND 4);
ALTER TABLE "practical_evidence"
  ADD CONSTRAINT "practical_evidence_file_or_link" CHECK (
    ("kind" = 'FILE' AND "object_key" IS NOT NULL AND "url" IS NULL AND "size_bytes" IS NOT NULL
      AND "size_bytes" BETWEEN 1 AND 10485760)
    OR ("kind" = 'LINK' AND "url" IS NOT NULL AND "object_key" IS NULL)
  );
