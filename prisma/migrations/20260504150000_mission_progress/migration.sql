-- Sessão 1.13 — mission_progress: per-operator state for the mission engine.

-- CreateEnum
CREATE TYPE "MissionProgressState" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "mission_progress" (
  "id"           UUID                 NOT NULL DEFAULT gen_random_uuid(),
  "mission_id"   UUID                 NOT NULL,
  "operator_id"  UUID                 NOT NULL,
  "state"        "MissionProgressState" NOT NULL DEFAULT 'NOT_STARTED',
  "progress"     JSONB                NOT NULL DEFAULT '{}',
  "completed_at" TIMESTAMPTZ(6),
  "created_at"   TIMESTAMPTZ(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMPTZ(6)       NOT NULL,

  CONSTRAINT "mission_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mission_progress_mission_id_operator_id_key"
  ON "mission_progress"("mission_id", "operator_id");

-- CreateIndex
CREATE INDEX "mission_progress_operator_id_idx" ON "mission_progress"("operator_id");

-- CreateIndex
CREATE INDEX "mission_progress_state_idx" ON "mission_progress"("state");

-- AddForeignKey
ALTER TABLE "mission_progress"
  ADD CONSTRAINT "mission_progress_mission_id_fkey"
  FOREIGN KEY ("mission_id") REFERENCES "missions"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_progress"
  ADD CONSTRAINT "mission_progress_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "operators"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
