-- Durable receipt deduplicates retries of one explicit user action while allowing a later intentional reorder.
CREATE TABLE IF NOT EXISTS "cart_reorder_operations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "external_order_id" varchar(100) NOT NULL,
  "customer_id" uuid NOT NULL,
  "idempotency_key" varchar(36) NOT NULL,
  "cart_id" uuid NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cart_reorder_operations_request_uk" UNIQUE ("customer_id", "external_order_id", "idempotency_key"),
  CONSTRAINT "cart_reorder_operations_order_chk" CHECK (btrim("external_order_id") <> ''),
  CONSTRAINT "cart_reorder_operations_key_chk" CHECK ("idempotency_key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "cart_reorder_operations_cart_fk"
    FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "cart_reorder_operations_customer_created_idx"
  ON "cart_reorder_operations" ("customer_id", "created_at" DESC);
