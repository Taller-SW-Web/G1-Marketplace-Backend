-- Store only the encrypted recipient snapshot needed for an eventual order email.
-- The feature remains disabled by default; this migration does not enqueue or send mail.
ALTER TABLE "checkout_operations"
  ADD COLUMN IF NOT EXISTS "recipient_email_encrypted" BYTEA;
