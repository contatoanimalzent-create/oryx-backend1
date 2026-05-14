-- Sessão 1.3 — operators: perfil tático 1:1 com User.

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM (
  'A_POS', 'A_NEG',
  'B_POS', 'B_NEG',
  'AB_POS', 'AB_NEG',
  'O_POS', 'O_NEG',
  'UNKNOWN'
);

-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "operators" (
  "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           UUID            NOT NULL,
  "callsign"          TEXT            NOT NULL,
  "bio"               TEXT,
  "emergency_contact" TEXT,
  "blood_type"        "BloodType"     NOT NULL DEFAULT 'UNKNOWN',
  "status"            "OperatorStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at"        TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMPTZ(6)  NOT NULL,

  CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operators_user_id_key" ON "operators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "operators_callsign_key" ON "operators"("callsign");

-- AddForeignKey
ALTER TABLE "operators"
  ADD CONSTRAINT "operators_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
