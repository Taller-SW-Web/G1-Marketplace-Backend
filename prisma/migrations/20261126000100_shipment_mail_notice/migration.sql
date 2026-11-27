BEGIN;

CREATE TABLE "shipment_mail_notice" (
    "event_id" VARCHAR(255) NOT NULL PRIMARY KEY,
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    CONSTRAINT "shipment_mail_notice_event_id_fkey"
        FOREIGN KEY ("event_id") REFERENCES "shipment_event_inbox" ("event_id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "shipment_mail_notice_pending_idx"
    ON "shipment_mail_notice" ("sent_at", "queued_at");

CREATE FUNCTION enqueue_shipment_mail_notice() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO "shipment_mail_notice" ("event_id")
    VALUES (NEW."event_id")
    ON CONFLICT ("event_id") DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "shipment_event_inbox_enqueue_mail_notice"
    AFTER INSERT ON "shipment_event_inbox"
    FOR EACH ROW
    WHEN ((NEW."payload" -> 'data' ->> 'publicStatus') = 'DESPACHADO')
    EXECUTE FUNCTION enqueue_shipment_mail_notice();

-- Replays dispatch events accepted by #357 before this migration.
INSERT INTO "shipment_mail_notice" ("event_id")
SELECT "event_id" FROM "shipment_event_inbox"
WHERE "payload" -> 'data' ->> 'publicStatus' = 'DESPACHADO'
ON CONFLICT ("event_id") DO NOTHING;

COMMIT;
