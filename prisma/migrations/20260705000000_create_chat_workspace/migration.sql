CREATE TYPE "documind_backend"."ChatRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "documind_backend"."chat_messages" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "role" "documind_backend"."ChatRole" NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documind_backend"."chat_sources" (
  "id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "source_index" INTEGER NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "quote" VARCHAR(1000) NOT NULL,
  "relevance" DECIMAL(5, 4),
  "created_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "chat_sources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_chat_messages_project_created_id"
  ON "documind_backend"."chat_messages"("project_id", "created_at", "id");

CREATE UNIQUE INDEX "uq_chat_sources_message_source_index"
  ON "documind_backend"."chat_sources"("message_id", "source_index");

CREATE INDEX "idx_chat_sources_document_id"
  ON "documind_backend"."chat_sources"("document_id");

ALTER TABLE "documind_backend"."chat_messages"
  ADD CONSTRAINT "chat_messages_project_id_fkey"
  FOREIGN KEY ("project_id")
  REFERENCES "documind_backend"."projects"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "documind_backend"."chat_sources"
  ADD CONSTRAINT "chat_sources_message_id_fkey"
  FOREIGN KEY ("message_id")
  REFERENCES "documind_backend"."chat_messages"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "documind_backend"."chat_sources"
  ADD CONSTRAINT "chat_sources_document_id_fkey"
  FOREIGN KEY ("document_id")
  REFERENCES "documind_backend"."documents"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
