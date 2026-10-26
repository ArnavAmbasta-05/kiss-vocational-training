-- F17 (ADR-09): pgvector for material embeddings (Neon and the pgvector/pgvector:pg16 image
-- both ship the extension).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "MaterialStatus" NOT NULL DEFAULT 'PENDING',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_chunks" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "embedding" vector(1024) NOT NULL,

    CONSTRAINT "material_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "chunk_ids" UUID[],
    "best_similarity" DOUBLE PRECISION,
    "refused" BOOLEAN NOT NULL DEFAULT false,
    "refusal_reason" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "materials_object_key_key" ON "materials"("object_key");

-- CreateIndex
CREATE INDEX "materials_course_id_status_idx" ON "materials"("course_id", "status");

-- CreateIndex
CREATE INDEX "materials_uploaded_by_id_idx" ON "materials"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "materials_approved_by_id_idx" ON "materials"("approved_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_chunks_material_id_ordinal_key" ON "material_chunks"("material_id", "ordinal");

-- CreateIndex
CREATE INDEX "assistant_logs_user_id_created_at_idx" ON "assistant_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "assistant_logs_created_at_idx" ON "assistant_logs"("created_at");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_logs" ADD CONSTRAINT "assistant_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cosine-distance index for top-k excerpt search (HNSW: good recall without training data).
CREATE INDEX "material_chunks_embedding_hnsw"
  ON "material_chunks" USING hnsw ("embedding" vector_cosine_ops);
