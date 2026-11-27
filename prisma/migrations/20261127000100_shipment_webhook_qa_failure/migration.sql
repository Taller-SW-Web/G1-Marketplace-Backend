CREATE TABLE "shipment_webhook_qa_failure" (
    "order_id" VARCHAR(20) PRIMARY KEY,
    "event_id" VARCHAR(255) NOT NULL,
    "correlation_id" VARCHAR(64) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shipment_webhook_qa_failure_synthetic_order_chk"
      CHECK ("order_id" ~ '^PED-(2099-[0-9]{5}|[0-9]{4}-9[0-9]{4})$')
);
