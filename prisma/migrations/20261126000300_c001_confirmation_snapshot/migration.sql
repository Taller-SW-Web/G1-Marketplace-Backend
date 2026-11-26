BEGIN;

-- G5 returns an order ID before payment is confirmed. Checkout saves that ID
-- while SUBMITTED to make the authorized status query and recover after a retry.
ALTER TABLE "checkout_operations"
    DROP CONSTRAINT "checkout_operations_result_chk",
    ADD CONSTRAINT "checkout_operations_result_chk" CHECK (
        (state = 'SUCCEEDED' AND external_order_id IS NOT NULL AND failure_code IS NULL AND completed_at IS NOT NULL)
        OR (state = 'FAILED' AND external_order_id IS NULL AND failure_code IS NOT NULL AND completed_at IS NOT NULL)
        OR (state = 'SUBMITTED' AND failure_code IS NULL AND completed_at IS NULL)
        OR (state IN ('PREPARING', 'PREPARED') AND external_order_id IS NULL AND failure_code IS NULL AND completed_at IS NULL)
    );

ALTER TABLE "notification_deliveries"
    ADD COLUMN "confirmation_snapshot" JSONB,
    ALTER COLUMN "provider_message_id" TYPE VARCHAR(512);

COMMIT;
