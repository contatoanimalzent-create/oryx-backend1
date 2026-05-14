-- Sessão 1.5 — teams: facções vinculadas a um evento.

-- CreateTable
CREATE TABLE "teams" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "event_id"    UUID           NOT NULL,
  "name"        TEXT           NOT NULL,
  "color"       TEXT           NOT NULL,
  "emblem"      TEXT,
  "description" TEXT,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_event_id_name_key" ON "teams"("event_id", "name");

-- CreateIndex
CREATE INDEX "teams_event_id_idx" ON "teams"("event_id");

-- AddForeignKey
ALTER TABLE "teams"
  ADD CONSTRAINT "teams_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
