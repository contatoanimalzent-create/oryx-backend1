-- Sessão 1.23 — Competitive 5×5: Rounds + Eliminations.

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable: rounds
CREATE TABLE "rounds" (
  "id"              UUID            NOT NULL DEFAULT gen_random_uuid(),
  "event_id"        UUID            NOT NULL,
  "round_number"    INTEGER         NOT NULL,
  "status"          "RoundStatus"   NOT NULL DEFAULT 'ACTIVE',
  "started_at"      TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at"        TIMESTAMPTZ(6),
  "winning_team_id" UUID,
  "note"            TEXT,
  "created_at"      TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ(6)  NOT NULL,

  CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rounds_event_id_round_number_key" ON "rounds"("event_id", "round_number");
CREATE INDEX "rounds_event_id_idx" ON "rounds"("event_id");
CREATE INDEX "rounds_status_idx"   ON "rounds"("status");

ALTER TABLE "rounds"
  ADD CONSTRAINT "rounds_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rounds"
  ADD CONSTRAINT "rounds_winning_team_id_fkey"
  FOREIGN KEY ("winning_team_id") REFERENCES "teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: round_eliminations
CREATE TABLE "round_eliminations" (
  "id"                      UUID           NOT NULL DEFAULT gen_random_uuid(),
  "round_id"                UUID           NOT NULL,
  "eliminated_operator_id"  UUID           NOT NULL,
  "eliminated_by_id"        UUID,
  "eliminated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note"                    TEXT,
  "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "round_eliminations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "round_eliminations_round_id_eliminated_operator_id_key"
  ON "round_eliminations"("round_id", "eliminated_operator_id");
CREATE INDEX "round_eliminations_round_id_idx"               ON "round_eliminations"("round_id");
CREATE INDEX "round_eliminations_eliminated_operator_id_idx" ON "round_eliminations"("eliminated_operator_id");
CREATE INDEX "round_eliminations_eliminated_by_id_idx"       ON "round_eliminations"("eliminated_by_id");

ALTER TABLE "round_eliminations"
  ADD CONSTRAINT "round_eliminations_round_id_fkey"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "round_eliminations"
  ADD CONSTRAINT "round_eliminations_eliminated_operator_id_fkey"
  FOREIGN KEY ("eliminated_operator_id") REFERENCES "operators"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "round_eliminations"
  ADD CONSTRAINT "round_eliminations_eliminated_by_id_fkey"
  FOREIGN KEY ("eliminated_by_id") REFERENCES "operators"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
