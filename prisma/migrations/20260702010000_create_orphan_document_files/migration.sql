-- CreateEnum
CREATE TYPE "documind_backend"."OrphanDocumentFileStatus" AS ENUM ('PENDING', 'CLEANED');

-- CreateTable
CREATE TABLE "documind_backend"."orphan_document_files" (
    "id" UUID NOT NULL,
    "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'local',
    "storage_key" VARCHAR(1000) NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "status" "documind_backend"."OrphanDocumentFileStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(1000),
    "next_retry_at" TIMESTAMPTZ(6) NOT NULL,
    "cleaned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orphan_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orphan_document_files_storage_key_key" ON "documind_backend"."orphan_document_files"("storage_key");

-- CreateIndex
CREATE INDEX "idx_orphan_document_files_due" ON "documind_backend"."orphan_document_files"("status", "next_retry_at", "created_at", "storage_key");
