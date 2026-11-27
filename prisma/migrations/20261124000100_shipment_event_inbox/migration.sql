CREATE TABLE "shipment_event_inbox" (
    "event_id" VARCHAR(255) NOT NULL,
    "order_id" VARCHAR(20) NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shipment_event_inbox_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "shipment_event_inbox_order_received_idx"
    ON "shipment_event_inbox"("order_id", "received_at" DESC);
