-- Sessão 1.11 — zones: PostGIS Polygon + GIST index para queries espaciais.

-- CreateTable
CREATE TABLE "zones" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "event_id"    UUID           NOT NULL,
  "name"        TEXT           NOT NULL,
  "description" TEXT,
  "boundary"    JSONB          NOT NULL,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- Generated PostGIS column. Mission engine (sessão 1.13) queries
-- ST_Contains(boundary_geo, position) for hit detection. Reads through Prisma
-- continue using the JSONB boundary directly.
ALTER TABLE "zones"
  ADD COLUMN "boundary_geo" geography(Polygon, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(boundary), 4326)::geography) STORED;

-- Spatial index for ST_Contains / ST_Intersects.
CREATE INDEX "zones_boundary_geo_gist_idx"
  ON "zones" USING GIST ("boundary_geo");

-- CreateIndex
CREATE UNIQUE INDEX "zones_event_id_name_key" ON "zones"("event_id", "name");

-- CreateIndex
CREATE INDEX "zones_event_id_idx" ON "zones"("event_id");

-- AddForeignKey
ALTER TABLE "zones"
  ADD CONSTRAINT "zones_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
