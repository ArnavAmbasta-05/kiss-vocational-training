-- CreateTable
CREATE TABLE "allocation_previews" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),

    CONSTRAINT "allocation_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "allocation_previews_cycle_id_idx" ON "allocation_previews"("cycle_id");

-- CreateIndex
CREATE INDEX "allocation_previews_expires_at_idx" ON "allocation_previews"("expires_at");
