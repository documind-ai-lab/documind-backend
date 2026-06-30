-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "documind_backend";

-- CreateEnum
CREATE TYPE "documind_backend"."ProjectType" AS ENUM ('ESTIMATE_REVIEW', 'PROPOSAL_REVIEW', 'CONTRACT_REVIEW', 'MEETING_SUMMARY', 'GENERAL_ANALYSIS');

-- CreateEnum
CREATE TYPE "documind_backend"."ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "documind_backend"."projects" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "type" "documind_backend"."ProjectType" NOT NULL,
    "status" "documind_backend"."ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "document_count" INTEGER NOT NULL DEFAULT 0,
    "risk_candidate_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_projects_status_last_activity_id" ON "documind_backend"."projects"("status", "last_activity_at", "id");
