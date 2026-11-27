-- Allow persisting external_order_id while checkout operation is in SUBMITTED state
-- (see checkout.service.ts: createOrder persists pedidoId before refreshOrder transitions to SUCCEEDED).
ALTER TABLE "checkout_operations" DROP CONSTRAINT "checkout_operations_result_chk";

ALTER TABLE "checkout_operations" ADD CONSTRAINT "checkout_operations_result_chk" CHECK (
  (
    state = 'SUCCEEDED'
    AND external_order_id IS NOT NULL
    AND failure_code IS NULL
    AND completed_at IS NOT NULL
  )
  OR
  (
    state = 'FAILED'
    AND external_order_id IS NULL
    AND failure_code IS NOT NULL
    AND completed_at IS NOT NULL
  )
  OR
  (
    state IN ('PREPARING', 'PREPARED')
    AND external_order_id IS NULL
    AND failure_code IS NULL
    AND completed_at IS NULL
  )
  OR
  (
    state = 'SUBMITTED'
    AND failure_code IS NULL
    AND completed_at IS NULL
  )
);
