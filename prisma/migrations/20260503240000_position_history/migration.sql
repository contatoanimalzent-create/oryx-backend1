-- Sessão 1.9 — position_history: append-only com coluna PostGIS gerada.

-- CreateTable
CREATE TABLE "position_history" (
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "operator_id"     UUID           NOT NULL,
  "event_id"        UUID           NOT NULL,
  "lat"             DOUBLE PRECISION NOT NULL,
  "lon"             DOUBLE PRECISION NOT NULL,
  "accuracy_m"      DOUBLE PRECISION,
  "heading_deg"     DOUBLE PRECISION,
  "speed_mps"       DOUBLE PRECISION,
  "client_event_id" UUID           NOT NULL,
  "recorded_at"     TIMESTAMPTZ(6) NOT NULL,
  "received_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "position_history_pkey" PRIMARY KEY ("id")
);

-- Generated PostGIS column (Prisma cannot model this directly). Spatial
-- queries (mission zone hits, AAR replays) use `location` via raw SQL.
-- Reads through the ORM continue to use lat/lon as Float.
ALTER TABLE "position_history"
  ADD COLUMN "location" geography(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) STORED;

-- Spatial index for ST_DWithin / ST_Contains in zone matching.
CREATE INDEX "position_history_location_gist_idx"
  ON "position_history" USING GIST ("location");

-- CreateIndex (operator timeline DESC)
CREATE INDEX "position_history_operator_id_recorded_at_idx"
  ON "position_history"("operator_id", "recorded_at" DESC);

-- CreateIndex (event timeline DESC)
CREATE INDEX "position_history_event_id_recorded_at_idx"
  ON "position_history"("event_id", "recorded_at" DESC);

-- CreateIndex (lookup by client_event_id for late dedup audits)
CREATE INDEX "position_history_client_event_id_idx"
  ON "position_history"("client_event_id");

-- AddForeignKey
ALTER TABLE "position_history"
  ADD CONSTRAINT "position_history_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "operators"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_history"
  ADD CONSTRAINT "position_history_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
