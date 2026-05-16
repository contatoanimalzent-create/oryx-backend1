-- ─── Battle Pass ──────────────────────────────────────────────────────────

CREATE TABLE "battle_pass_seasons" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "number"         INT NOT NULL,
    "name"           TEXT NOT NULL,
    "starts_at"      TIMESTAMPTZ(6) NOT NULL,
    "ends_at"        TIMESTAMPTZ(6) NOT NULL,
    "premium_cents"  INT NOT NULL DEFAULT 3990,
    "max_level"      INT NOT NULL DEFAULT 50,
    "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "battle_pass_seasons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "battle_pass_seasons_number_unique" ON "battle_pass_seasons"("number");

-- ─── Cosmetics ────────────────────────────────────────────────────────────

CREATE TYPE "CosmeticKind" AS ENUM ('PATCH','SKIN','CALLSIGN_BG','AVATAR_FRAME');
CREATE TYPE "CosmeticRarity" AS ENUM ('COMMON','RARE','EPIC','LEGENDARY');

CREATE TABLE "cosmetics" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "code"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "kind"        "CosmeticKind" NOT NULL,
    "rarity"      "CosmeticRarity" NOT NULL DEFAULT 'COMMON',
    "price_cents" INT NOT NULL DEFAULT 0,
    "image_url"   TEXT NOT NULL,
    "available"   BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cosmetics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cosmetics_code_unique" ON "cosmetics"("code");
CREATE INDEX "cosmetics_kind_available_idx" ON "cosmetics"("kind","available");

-- Battle pass rewards reference cosmetics, so cosmetics must exist first.
CREATE TABLE "battle_pass_rewards" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id"          UUID NOT NULL,
    "level"              INT NOT NULL,
    "premium_only"       BOOLEAN NOT NULL DEFAULT false,
    "cosmetic_id"        UUID,
    "xp_bonus"           INT NOT NULL DEFAULT 0,
    "wallet_bonus_cents" INT NOT NULL DEFAULT 0,
    "description"        TEXT NOT NULL,
    CONSTRAINT "battle_pass_rewards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "battle_pass_rewards_season_fkey"   FOREIGN KEY ("season_id")   REFERENCES "battle_pass_seasons"("id") ON DELETE CASCADE,
    CONSTRAINT "battle_pass_rewards_cosmetic_fkey" FOREIGN KEY ("cosmetic_id") REFERENCES "cosmetics"("id")           ON DELETE SET NULL
);
CREATE UNIQUE INDEX "battle_pass_rewards_unique" ON "battle_pass_rewards"("season_id","level","premium_only");

CREATE TABLE "user_battle_passes" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "operator_id"     UUID NOT NULL,
    "season_id"       UUID NOT NULL,
    "is_premium"      BOOLEAN NOT NULL DEFAULT false,
    "current_xp"      INT NOT NULL DEFAULT 0,
    "claimed_levels"  INT[] NOT NULL DEFAULT ARRAY[]::INT[],
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_battle_passes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_battle_passes_season_fkey"   FOREIGN KEY ("season_id")   REFERENCES "battle_pass_seasons"("id") ON DELETE CASCADE,
    CONSTRAINT "user_battle_passes_operator_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id")           ON DELETE CASCADE
);
CREATE UNIQUE INDEX "user_battle_passes_unique" ON "user_battle_passes"("operator_id","season_id");
CREATE INDEX "user_battle_passes_operator_idx" ON "user_battle_passes"("operator_id");

CREATE TABLE "user_cosmetics" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "operator_id" UUID NOT NULL,
    "cosmetic_id" UUID NOT NULL,
    "is_equipped" BOOLEAN NOT NULL DEFAULT false,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_cosmetics_cosmetic_fkey" FOREIGN KEY ("cosmetic_id") REFERENCES "cosmetics"("id")  ON DELETE CASCADE,
    CONSTRAINT "user_cosmetics_operator_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "user_cosmetics_unique" ON "user_cosmetics"("operator_id","cosmetic_id");
CREATE INDEX "user_cosmetics_equipped_idx" ON "user_cosmetics"("operator_id","is_equipped");

-- ─── Media Storage ────────────────────────────────────────────────────────

CREATE TYPE "MediaKind" AS ENUM ('PROFILE_PHOTO','POST_MEDIA','CLIP','EVIDENCE','DOCUMENT');

CREATE TABLE "media_uploads" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "uploader_id" UUID NOT NULL,
    "kind"        "MediaKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "public_url"  TEXT,
    "size_bytes"  INT,
    "mime_type"   TEXT,
    "confirmed"   BOOLEAN NOT NULL DEFAULT false,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "media_uploads_key_unique" ON "media_uploads"("storage_key");
CREATE INDEX "media_uploads_uploader_idx" ON "media_uploads"("uploader_id","kind","created_at");
