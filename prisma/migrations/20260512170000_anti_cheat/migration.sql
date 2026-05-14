-- Sessão 1.17 — anti-cheat suspicion log.

-- CreateEnum
CREATE TYPE "CheatDetector" AS ENUM (
  'SPEED_IMPOSSIBLE',
  'LOCATION_JUMP',
  'GPS_INCONSISTENCY'
);

-- CreateEnum
CREATE TYPE "CheatSeverity" AS ENUM ('MINOR', 'MAJOR', 'SEVERE');

-- CreateTable
CREATE TABLE "cheat_suspicions" (
  "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
  "operator_id" UUID            NOT NULL,
  "event_id"    UUID,
  "detector"    "CheatDetector" NOT NULL,
  "severity"    "CheatSeverity" NOT NULL,
  "evidence"    JSONB           NOT NULL,
  "recorded_at" TIMESTAMPTZ(6)  NOT NULL,
  "created_at"  TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cheat_suspicions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cheat_suspicions_operator_id_idx" ON "cheat_suspicions"("operator_id");

-- CreateIndex
CREATE INDEX "cheat_suspicions_event_id_idx" ON "cheat_suspicions"("event_id");

-- CreateIndex
CREATE INDEX "cheat_suspicions_operator_id_created_at_idx"
  ON "cheat_suspicions"("operator_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "cheat_suspicions"
  ADD CONSTRAINT "cheat_suspicions_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "operators"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheat_suspicions"
  ADD CONSTRAINT "cheat_suspicions_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
