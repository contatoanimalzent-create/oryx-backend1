-- Sessão 1.12 — missions: 7 tipos com config tipo-específico em JSONB.

-- CreateEnum
CREATE TYPE "MissionType" AS ENUM (
  'CAPTURE',
  'DEFEND',
  'HOLD',
  'CHECKPOINT',
  'TIME',
  'SQUAD',
  'FACTION'
);

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "missions" (
  "id"            UUID             NOT NULL DEFAULT gen_random_uuid(),
  "event_id"      UUID             NOT NULL,
  "type"          "MissionType"    NOT NULL,
  "name"          TEXT             NOT NULL,
  "description"   TEXT,
  "zone_id"       UUID,
  "config"        JSONB            NOT NULL,
  "points_reward" INTEGER          NOT NULL DEFAULT 0,
  "status"        "MissionStatus"  NOT NULL DEFAULT 'PENDING',
  "created_at"    TIMESTAMPTZ(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ(6)   NOT NULL,

  CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "missions_event_id_name_key" ON "missions"("event_id", "name");

-- CreateIndex
CREATE INDEX "missions_event_id_idx" ON "missions"("event_id");

-- CreateIndex
CREATE INDEX "missions_zone_id_idx" ON "missions"("zone_id");

-- CreateIndex
CREATE INDEX "missions_status_idx" ON "missions"("status");

-- AddForeignKey
ALTER TABLE "missions"
  ADD CONSTRAINT "missions_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- AddForeignKey: zone delete leaves mission orphaned (zoneId becomes NULL).
-- Mission engine (1.13) treats missions with NULL zone according to type.
ALTER TABLE "missions"
  ADD CONSTRAINT "missions_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "zones"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
