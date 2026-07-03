CREATE TABLE "documind_backend"."document_texts" (
  "id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "token_count" INTEGER,
  "extracted_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "document_texts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_texts_document_id_key"
  ON "documind_backend"."document_texts"("document_id");

CREATE INDEX "idx_document_texts_project_extracted"
  ON "documind_backend"."document_texts"("project_id", "extracted_at", "document_id");

ALTER TABLE "documind_backend"."document_texts"
  ADD CONSTRAINT "document_texts_document_id_fkey"
  FOREIGN KEY ("document_id")
  REFERENCES "documind_backend"."documents"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
