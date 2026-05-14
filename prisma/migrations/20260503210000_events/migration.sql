-- Sessão 1.4 — events: tabela + enums + lifecycle.

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('WARFARE', 'COMPETITIVE', 'CHALLENGER', 'SNIPER', 'TACTICAL_TRAINING');

-- CreateTable
CREATE TABLE "events" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "name"             TEXT           NOT NULL,
  "description"      TEXT,
  "mode"             "EventMode"    NOT NULL,
  "status"           "EventStatus"  NOT NULL DEFAULT 'DRAFT',
  "operational_area" JSONB          NOT NULL,
  "starts_at"        TIMESTAMPTZ(6),
  "ends_at"          TIMESTAMPTZ(6),
  "created_by_id"    UUID,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_mode_idx" ON "events"("mode");

-- AddForeignKey
ALTER TABLE "events"
  ADD CONSTRAINT "events_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
