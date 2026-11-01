-- Migration: 20261018135249_npm_run_prisma_migrate
-- Idempotent index and constraint creation for cart and checkout operations

-- 1. Ensure indexes exist without throwing 42P07 if already created in 0_init
DROP INDEX IF EXISTS "cart_items_product_id_idx";
CREATE INDEX IF NOT EXISTS "cart_items_product_id_idx" ON "cart_items"("product_id");

DROP INDEX IF EXISTS "cart_items_variant_id_idx";
CREATE INDEX IF NOT EXISTS "cart_items_variant_id_idx" ON "cart_items"("variant_id");

DROP INDEX IF EXISTS "carts_merged_into_cart_idx";
CREATE INDEX IF NOT EXISTS "carts_merged_into_cart_idx" ON "carts"("merged_into_cart_id");

DROP INDEX IF EXISTS "checkout_operations_external_order_idx";
CREATE INDEX IF NOT EXISTS "checkout_operations_external_order_idx" ON "checkout_operations"("external_order_id");

-- 2. Safely rename foreign key constraints only if original exists and target does not
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cart_items_cart_fk' 
      AND conrelid = 'cart_items'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cart_items_cart_id_fkey' 
      AND conrelid = 'cart_items'::regclass
  ) THEN
    ALTER TABLE "cart_items" RENAME CONSTRAINT "cart_items_cart_fk" TO "cart_items_cart_id_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'carts_merged_into_cart_fk' 
      AND conrelid = 'carts'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'carts_merged_into_cart_id_fkey' 
      AND conrelid = 'carts'::regclass
  ) THEN
    ALTER TABLE "carts" RENAME CONSTRAINT "carts_merged_into_cart_fk" TO "carts_merged_into_cart_id_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'checkout_operations_cart_fk' 
      AND conrelid = 'checkout_operations'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'checkout_operations_cart_id_fkey' 
      AND conrelid = 'checkout_operations'::regclass
  ) THEN
    ALTER TABLE "checkout_operations" RENAME CONSTRAINT "checkout_operations_cart_fk" TO "checkout_operations_cart_id_fkey";
  END IF;
END $$;
