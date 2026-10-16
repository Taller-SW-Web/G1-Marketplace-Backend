ALTER TABLE checkout_operations
  ADD COLUMN prepared_quote_id varchar(100),
  ADD COLUMN prepared_cart_version integer,
  ADD COLUMN prepared_address_id varchar(100),
  ADD COLUMN prepared_expires_at timestamptz,
  ADD COLUMN prepared_total_amount numeric(12, 2),
  ADD COLUMN prepared_total_currency char(3),
  ADD COLUMN prepared_lines jsonb,
  ADD COLUMN revalidated_at timestamptz,
  ADD COLUMN order_idempotency_key varchar(255);

CREATE UNIQUE INDEX checkout_operations_customer_order_idempotency_uk
  ON checkout_operations (customer_id, order_idempotency_key);

ALTER TABLE checkout_operations
  ADD CONSTRAINT checkout_operations_prepared_context_chk CHECK (
    (
      prepared_quote_id IS NULL
      AND prepared_cart_version IS NULL
      AND prepared_address_id IS NULL
      AND prepared_expires_at IS NULL
      AND prepared_total_amount IS NULL
      AND prepared_total_currency IS NULL
      AND prepared_lines IS NULL
      AND revalidated_at IS NULL
    )
    OR
    (
      prepared_quote_id IS NOT NULL
      AND btrim(prepared_quote_id) <> ''
      AND prepared_cart_version IS NOT NULL
      AND prepared_cart_version >= 0
      AND prepared_address_id IS NOT NULL
      AND btrim(prepared_address_id) <> ''
      AND prepared_expires_at IS NOT NULL
      AND prepared_total_amount IS NOT NULL
      AND prepared_total_amount >= 0
      AND prepared_total_currency IS NOT NULL
      AND prepared_total_currency = 'PEN'
      AND prepared_lines IS NOT NULL
      AND jsonb_typeof(prepared_lines) = 'array'
    )
  );

ALTER TABLE checkout_operations
  ADD CONSTRAINT checkout_operations_revalidated_at_chk CHECK (
    revalidated_at IS NULL OR prepared_quote_id IS NOT NULL
  );
