CREATE TABLE "security_user_event_inbox" (
    "event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "event_version" INTEGER NOT NULL,
    "payload_sha256" CHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_user_event_inbox_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "security_user_event_inbox_received_idx"
    ON "security_user_event_inbox"("received_at");
