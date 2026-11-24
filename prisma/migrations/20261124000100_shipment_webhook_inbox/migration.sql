CREATE TABLE "shipment_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "order_id" VARCHAR(100) NOT NULL,
  "public_status" VARCHAR(20) NOT NULL,
  "tracking_number" VARCHAR(100) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "estimated_delivery_date" DATE,
  "payload_fingerprint" CHAR(64) NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notification_queued_at" TIMESTAMPTZ(6),
  CONSTRAINT "shipment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shipment_webhook_events_event_id_uk"
  ON "shipment_webhook_events"("event_id");

CREATE INDEX "shipment_webhook_events_order_occurred_idx"
  ON "shipment_webhook_events"("order_id", "occurred_at" ASC);

CREATE INDEX "shipment_webhook_events_notification_idx"
  ON "shipment_webhook_events"("order_id", "notification_queued_at");
