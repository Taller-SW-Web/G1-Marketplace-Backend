ALTER TABLE "notification_deliveries"
    ADD COLUMN "confirmation_snapshot" JSONB,
    ALTER COLUMN "provider_message_id" TYPE VARCHAR(512);
