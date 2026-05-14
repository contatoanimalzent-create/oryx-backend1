-- Sessão 1.16 — reputation logs (penalties + commendations).

-- CreateEnum
CREATE TYPE "ReputationKind" AS ENUM ('PENALTY', 'COMMENDATION');

-- CreateEnum
CREATE TYPE "ReputationSeverity" AS ENUM ('MINOR', 'MAJOR', 'SEVERE');

-- CreateEnum
CREATE TYPE "ReputationReason" AS ENUM (
  'CHEATING',
  'AFK',
  'NO_SHOW',
  'ABUSIVE_BEHAVIOR',
  'UNSAFE_CONDUCT',
  'OUTSTANDING_PERFORMANCE',
  'TEAMWORK',
  'OTHER'
);

-- CreateTable
CREATE TABLE "reputation_logs" (
  "id"            UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "operator_id"   UUID                  NOT NULL,
  "event_id"      UUID,
  "kind"          "ReputationKind"      NOT NULL,
  "severity"      "ReputationSeverity"  NOT NULL,
  "reason"        "ReputationReason"    NOT NULL,
  "delta"         INTEGER               NOT NULL,
  "note"          TEXT,
  "created_by_id" UUID,
  "created_at"    TIMESTAMPTZ(6)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reputation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reputation_logs_operator_id_idx" ON "reputation_logs"("operator_id");

-- CreateIndex
CREATE INDEX "reputation_logs_event_id_idx" ON "reputation_logs"("event_id");

-- CreateIndex
CREATE INDEX "reputation_logs_operator_id_created_at_idx"
  ON "reputation_logs"("operator_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "reputation_logs"
  ADD CONSTRAINT "reputation_logs_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "operators"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_logs"
  ADD CONSTRAINT "reputation_logs_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_logs"
  ADD CONSTRAINT "reputation_logs_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
