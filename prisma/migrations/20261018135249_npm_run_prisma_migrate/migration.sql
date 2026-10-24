-- Drop existing partial indexes if they exist before creating the standard indexes
DROP INDEX IF EXISTS "cart_items_product_id_idx";
CREATE INDEX IF NOT EXISTS "cart_items_product_id_idx" ON "cart_items"("product_id");

DROP INDEX IF EXISTS "cart_items_variant_id_idx";
CREATE INDEX IF NOT EXISTS "cart_items_variant_id_idx" ON "cart_items"("variant_id");

DROP INDEX IF EXISTS "carts_merged_into_cart_idx";
CREATE INDEX IF NOT EXISTS "carts_merged_into_cart_idx" ON "carts"("merged_into_cart_id");

DROP INDEX IF EXISTS "checkout_operations_external_order_idx";
CREATE INDEX IF NOT EXISTS "checkout_operations_external_order_idx" ON "checkout_operations"("external_order_id");

-- RenameForeignKeys conditionally to avoid errors if already renamed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_cart_fk') THEN
    ALTER TABLE "cart_items" RENAME CONSTRAINT "cart_items_cart_fk" TO "cart_items_cart_id_fkey";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carts_merged_into_cart_fk') THEN
    ALTER TABLE "carts" RENAME CONSTRAINT "carts_merged_into_cart_fk" TO "carts_merged_into_cart_id_fkey";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_operations_cart_fk') THEN
    ALTER TABLE "checkout_operations" RENAME CONSTRAINT "checkout_operations_cart_fk" TO "checkout_operations_cart_id_fkey";
  END IF;
END $$;

