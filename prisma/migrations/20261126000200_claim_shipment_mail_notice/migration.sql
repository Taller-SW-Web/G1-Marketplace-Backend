ALTER TABLE "shipment_mail_notice"
    ADD COLUMN "attempted_at" TIMESTAMPTZ(6),
    ADD COLUMN "provider_message_id" VARCHAR(512);
