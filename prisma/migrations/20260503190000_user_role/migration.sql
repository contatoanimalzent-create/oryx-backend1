-- Sessão 1.2 — RBAC: enum Role + coluna users.role.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OPERATOR', 'SQUAD_LEADER', 'ADMIN', 'INSTRUCTOR');

-- AlterTable
-- Existing users registered in session 1.1 are backfilled to OPERATOR by the
-- DEFAULT clause; first-admin bootstrap is a separate concern (CLI script in a
-- future session, when admin UI exists).
ALTER TABLE "users"
  ADD COLUMN "role" "Role" NOT NULL DEFAULT 'OPERATOR';
