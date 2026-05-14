-- Sessão 1.6 — squads: sub-grupo de uma facção + tabela junção SquadMember.

-- CreateEnum
CREATE TYPE "SquadStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISBANDED');

-- CreateTable
CREATE TABLE "squads" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "team_id"     UUID           NOT NULL,
  "name"        TEXT           NOT NULL,
  "description" TEXT,
  "leader_id"   UUID,
  "status"      "SquadStatus"  NOT NULL DEFAULT 'ACTIVE',
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "squads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "squads_team_id_name_key" ON "squads"("team_id", "name");

-- CreateIndex
CREATE INDEX "squads_team_id_idx" ON "squads"("team_id");

-- CreateIndex
CREATE INDEX "squads_leader_id_idx" ON "squads"("leader_id");

-- AddForeignKey
ALTER TABLE "squads"
  ADD CONSTRAINT "squads_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squads"
  ADD CONSTRAINT "squads_leader_id_fkey"
  FOREIGN KEY ("leader_id") REFERENCES "operators"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "squad_members" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "squad_id"    UUID           NOT NULL,
  "operator_id" UUID           NOT NULL,
  "joined_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "squad_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "squad_members_squad_id_operator_id_key"
  ON "squad_members"("squad_id", "operator_id");

-- CreateIndex
CREATE INDEX "squad_members_operator_id_idx" ON "squad_members"("operator_id");

-- AddForeignKey
ALTER TABLE "squad_members"
  ADD CONSTRAINT "squad_members_squad_id_fkey"
  FOREIGN KEY ("squad_id") REFERENCES "squads"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_members"
  ADD CONSTRAINT "squad_members_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "operators"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
