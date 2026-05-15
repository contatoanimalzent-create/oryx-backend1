-- ─── Social ──────────────────────────────────────────────────────────────

CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

CREATE TABLE "friendships" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_id" UUID NOT NULL,
    "receiver_id"  UUID NOT NULL,
    "status"       "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at"  TIMESTAMPTZ(6),
    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "friendships_requester_fkey" FOREIGN KEY ("requester_id") REFERENCES "operators"("id") ON DELETE CASCADE,
    CONSTRAINT "friendships_receiver_fkey"  FOREIGN KEY ("receiver_id")  REFERENCES "operators"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "friendships_pair_unique" ON "friendships"("requester_id","receiver_id");
CREATE INDEX "friendships_receiver_status_idx" ON "friendships"("receiver_id","status");

CREATE TYPE "FeedPostKind" AS ENUM ('CLIP','PHOTO','TEXT','ACHIEVEMENT');

CREATE TABLE "feed_posts" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id"     UUID NOT NULL,
    "kind"          "FeedPostKind" NOT NULL DEFAULT 'TEXT',
    "caption"       TEXT,
    "media_url"     TEXT,
    "event_id"      UUID,
    "like_count"    INT NOT NULL DEFAULT 0,
    "comment_count" INT NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feed_posts_author_fkey" FOREIGN KEY ("author_id") REFERENCES "operators"("id") ON DELETE CASCADE
);
CREATE INDEX "feed_posts_author_created_idx" ON "feed_posts"("author_id","created_at");
CREATE INDEX "feed_posts_created_idx" ON "feed_posts"("created_at");

CREATE TABLE "post_likes" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id"     UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "post_likes_post_fkey"     FOREIGN KEY ("post_id")     REFERENCES "feed_posts"("id") ON DELETE CASCADE,
    CONSTRAINT "post_likes_operator_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id")  ON DELETE CASCADE
);
CREATE UNIQUE INDEX "post_likes_pair_unique" ON "post_likes"("post_id","operator_id");
CREATE INDEX "post_likes_post_idx" ON "post_likes"("post_id");

CREATE TABLE "post_comments" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id"     UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "body"        TEXT NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "post_comments_post_fkey"     FOREIGN KEY ("post_id")     REFERENCES "feed_posts"("id") ON DELETE CASCADE,
    CONSTRAINT "post_comments_operator_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id")  ON DELETE CASCADE
);
CREATE INDEX "post_comments_post_created_idx" ON "post_comments"("post_id","created_at");

-- ─── Referral ────────────────────────────────────────────────────────────

CREATE TABLE "referral_codes" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "operator_id" UUID NOT NULL,
    "code"        TEXT NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "referral_codes_operator_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "referral_codes_operator_unique" ON "referral_codes"("operator_id");
CREATE UNIQUE INDEX "referral_codes_code_unique" ON "referral_codes"("code");

CREATE TABLE "referral_redemptions" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "code_id"        UUID NOT NULL,
    "referee_id"     UUID NOT NULL,
    "reward_cents"   INT NOT NULL DEFAULT 2000,
    "reward_paid"    BOOLEAN NOT NULL DEFAULT false,
    "reward_paid_at" TIMESTAMPTZ(6),
    "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_redemptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "referral_redemptions_code_fkey"    FOREIGN KEY ("code_id")    REFERENCES "referral_codes"("id") ON DELETE CASCADE,
    CONSTRAINT "referral_redemptions_referee_fkey" FOREIGN KEY ("referee_id") REFERENCES "operators"("id")      ON DELETE CASCADE
);
CREATE UNIQUE INDEX "referral_redemptions_referee_unique" ON "referral_redemptions"("referee_id");
CREATE INDEX "referral_redemptions_code_idx" ON "referral_redemptions"("code_id");

-- ─── Wallet ──────────────────────────────────────────────────────────────

CREATE TYPE "WalletTxKind" AS ENUM (
  'DEPOSIT','WITHDRAW','REFERRAL_BONUS','MARKETPLACE_SALE',
  'MARKETPLACE_PURCHASE','EVENT_FEE','REFUND','ADJUSTMENT'
);
CREATE TYPE "WalletTxStatus" AS ENUM ('PENDING','COMPLETED','FAILED','CANCELLED');

CREATE TABLE "wallet_accounts" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "operator_id"   UUID NOT NULL,
    "balance_cents" INT NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_accounts_operator_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "wallet_accounts_operator_unique" ON "wallet_accounts"("operator_id");

CREATE TABLE "wallet_transactions" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id"    UUID NOT NULL,
    "kind"         "WalletTxKind" NOT NULL,
    "status"       "WalletTxStatus" NOT NULL DEFAULT 'PENDING',
    "amount_cents" INT NOT NULL,
    "description"  TEXT NOT NULL,
    "external_ref" TEXT,
    "metadata"     JSONB,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_transactions_wallet_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE
);
CREATE INDEX "wallet_transactions_wallet_created_idx" ON "wallet_transactions"("wallet_id","created_at");
CREATE INDEX "wallet_transactions_external_idx" ON "wallet_transactions"("external_ref");

-- ─── Marketplace ─────────────────────────────────────────────────────────

CREATE TYPE "ProductCategory" AS ENUM (
  'REPLICA','TACTICAL_GEAR','AMMO','ACCESSORY','PATCH','COSMETIC','OTHER'
);
CREATE TYPE "ProductCondition" AS ENUM ('NEW','LIKE_NEW','USED','FOR_PARTS');
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT','ACTIVE','SOLD','EXPIRED','REMOVED');

CREATE TABLE "products" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "seller_id"   UUID NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category"    "ProductCategory" NOT NULL,
    "condition"   "ProductCondition" NOT NULL DEFAULT 'USED',
    "price_cents" INT NOT NULL,
    "city"        TEXT NOT NULL,
    "state"       TEXT NOT NULL,
    "photo_urls"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"      "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_seller_fkey" FOREIGN KEY ("seller_id") REFERENCES "operators"("id") ON DELETE CASCADE
);
CREATE INDEX "products_status_category_created_idx" ON "products"("status","category","created_at");
CREATE INDEX "products_seller_idx" ON "products"("seller_id");

CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING_PAYMENT','PAID','SHIPPED','DELIVERED','CANCELLED','REFUNDED'
);

CREATE TABLE "orders" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "buyer_id"         UUID NOT NULL,
    "total_cents"      INT NOT NULL,
    "shipping_cents"   INT NOT NULL DEFAULT 0,
    "status"           "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "shipping_address" JSONB,
    "tracking_code"    TEXT,
    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_buyer_fkey" FOREIGN KEY ("buyer_id") REFERENCES "operators"("id") ON DELETE RESTRICT
);
CREATE INDEX "orders_buyer_created_idx" ON "orders"("buyer_id","created_at");
CREATE INDEX "orders_status_idx" ON "orders"("status");

CREATE TABLE "order_items" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id"         UUID NOT NULL,
    "product_id"       UUID NOT NULL,
    "qty"              INT NOT NULL DEFAULT 1,
    "unit_price_cents" INT NOT NULL,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_items_order_fkey"   FOREIGN KEY ("order_id")   REFERENCES "orders"("id")   ON DELETE CASCADE,
    CONSTRAINT "order_items_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT
);
CREATE INDEX "order_items_order_idx" ON "order_items"("order_id");
