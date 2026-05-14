-- Initial migration: enable PostgreSQL extensions required across all domain modules.
-- No domain tables here — those are added per feature module in Fase 1.x sessions.

-- PostGIS: geographic types (Point, Polygon) for live positions, zones, missions.
CREATE EXTENSION IF NOT EXISTS "postgis";

-- pgcrypto: gen_random_uuid() for UUID v4 primary keys.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
