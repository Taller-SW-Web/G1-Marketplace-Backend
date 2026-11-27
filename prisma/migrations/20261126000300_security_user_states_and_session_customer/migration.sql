-- Link transient BFF sessions to customer_id for event-driven invalidation
ALTER TABLE "auth_sessions"
  ADD COLUMN "customer_id" UUID;

CREATE INDEX "auth_sessions_customer_idx"
  ON "auth_sessions"("customer_id");

-- Durable per-user security state populated by RabbitMQ security events
CREATE TABLE "security_user_states" (
  "user_id" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "invalidated_at" TIMESTAMPTZ(6),
  "last_event_id" VARCHAR(255) NOT NULL,
  "last_event_type" VARCHAR(100) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_user_states_pkey" PRIMARY KEY ("user_id")
);
