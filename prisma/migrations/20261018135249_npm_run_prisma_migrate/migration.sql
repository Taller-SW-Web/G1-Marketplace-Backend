-- CreateIndex
CREATE INDEX "cart_items_product_id_idx" ON "cart_items"("product_id");

-- CreateIndex
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- CreateIndex
CREATE INDEX "carts_merged_into_cart_idx" ON "carts"("merged_into_cart_id");

-- CreateIndex
CREATE INDEX "checkout_operations_external_order_idx" ON "checkout_operations"("external_order_id");

-- RenameForeignKey
ALTER TABLE "cart_items" RENAME CONSTRAINT "cart_items_cart_fk" TO "cart_items_cart_id_fkey";

-- RenameForeignKey
ALTER TABLE "carts" RENAME CONSTRAINT "carts_merged_into_cart_fk" TO "carts_merged_into_cart_id_fkey";

-- RenameForeignKey
ALTER TABLE "checkout_operations" RENAME CONSTRAINT "checkout_operations_cart_fk" TO "checkout_operations_cart_id_fkey";
