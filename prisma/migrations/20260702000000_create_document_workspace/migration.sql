-- CreateEnum
CREATE TYPE "documind_backend"."DocumentStatus" AS ENUM ('TEXT_EXTRACTION_PENDING', 'TEXT_EXTRACTING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "documind_backend"."documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'local',
    "storage_key" VARCHAR(1000) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "extension" VARCHAR(16) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "documind_backend"."DocumentStatus" NOT NULL DEFAULT 'TEXT_EXTRACTION_PENDING',
    "failure_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_documents_project_created_id" ON "documind_backend"."documents"("project_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "documind_backend"."documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "documind_backend"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
