-- Sessão 1.21 — tactical layer: Units, Instructor assignments, Classes, Exercises.

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExerciseStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateTable: units
CREATE TABLE "units" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "name"         TEXT           NOT NULL,
  "abbreviation" TEXT,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- CreateTable: unit_instructors (junction)
CREATE TABLE "unit_instructors" (
  "unit_id"     UUID           NOT NULL,
  "user_id"     UUID           NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "unit_instructors_pkey" PRIMARY KEY ("unit_id", "user_id")
);

CREATE INDEX "unit_instructors_user_id_idx" ON "unit_instructors"("user_id");

ALTER TABLE "unit_instructors"
  ADD CONSTRAINT "unit_instructors_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unit_instructors"
  ADD CONSTRAINT "unit_instructors_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: classes
CREATE TABLE "classes" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "unit_id"            UUID           NOT NULL,
  "lead_instructor_id" UUID           NOT NULL,
  "name"               TEXT           NOT NULL,
  "starts_at"          TIMESTAMPTZ(6) NOT NULL,
  "ends_at"            TIMESTAMPTZ(6),
  "status"             "ClassStatus"  NOT NULL DEFAULT 'PLANNED',
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "classes_unit_id_idx"            ON "classes"("unit_id");
CREATE INDEX "classes_lead_instructor_id_idx" ON "classes"("lead_instructor_id");
CREATE INDEX "classes_status_idx"             ON "classes"("status");

ALTER TABLE "classes"
  ADD CONSTRAINT "classes_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "classes"
  ADD CONSTRAINT "classes_lead_instructor_id_fkey"
  FOREIGN KEY ("lead_instructor_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: exercises
CREATE TABLE "exercises" (
  "id"           UUID             NOT NULL DEFAULT gen_random_uuid(),
  "class_id"     UUID             NOT NULL,
  "event_id"     UUID,
  "name"         TEXT             NOT NULL,
  "description"  TEXT,
  "scheduled_at" TIMESTAMPTZ(6),
  "status"       "ExerciseStatus" NOT NULL DEFAULT 'PLANNED',
  "created_at"   TIMESTAMPTZ(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMPTZ(6)   NOT NULL,

  CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exercises_event_id_key" ON "exercises"("event_id");
CREATE INDEX "exercises_class_id_idx"        ON "exercises"("class_id");
CREATE INDEX "exercises_status_idx"          ON "exercises"("status");

ALTER TABLE "exercises"
  ADD CONSTRAINT "exercises_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercises"
  ADD CONSTRAINT "exercises_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
