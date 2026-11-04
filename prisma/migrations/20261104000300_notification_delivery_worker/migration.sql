ALTER TYPE "notification_delivery_state" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "notification_delivery_state" ADD VALUE IF NOT EXISTS 'RECONCILIATION_REQUIRED';

ALTER TABLE "notification_deliveries"
  ADD COLUMN IF NOT EXISTS "payload_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lease_token" VARCHAR(36),
  ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "last_error_code" VARCHAR(100);

CREATE INDEX IF NOT EXISTS "notification_deliveries_dispatch_idx"
  ON "notification_deliveries"("state", "next_attempt_at", "created_at");
