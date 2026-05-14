-- Sessão 1.14 — notifications + device tokens.

-- CreateEnum
CREATE TYPE "NotificationTarget" AS ENUM ('GLOBAL', 'EVENT', 'TEAM', 'SQUAD', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateTable
CREATE TABLE "notifications" (
  "id"            UUID                 NOT NULL DEFAULT gen_random_uuid(),
  "target"        "NotificationTarget" NOT NULL,
  "target_id"     UUID,
  "title"         TEXT                 NOT NULL,
  "body"          TEXT                 NOT NULL,
  "status"        "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "sent_count"    INTEGER              NOT NULL DEFAULT 0,
  "failed_count"  INTEGER              NOT NULL DEFAULT 0,
  "sent_at"       TIMESTAMPTZ(6),
  "error"         TEXT,
  "created_by_id" UUID,
  "created_at"    TIMESTAMPTZ(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ(6)       NOT NULL,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_target_target_id_idx" ON "notifications"("target", "target_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- AddForeignKey
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "device_tokens" (
  "id"            UUID             NOT NULL DEFAULT gen_random_uuid(),
  "user_id"       UUID             NOT NULL,
  "token"         TEXT             NOT NULL,
  "platform"      "DevicePlatform" NOT NULL,
  "registered_at" TIMESTAMPTZ(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "device_tokens"
  ADD CONSTRAINT "device_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
