-- Esquema físico inicial del Marketplace para PostgreSQL 16.
-- Las referencias a entidades de otros módulos se almacenan sin claves foráneas.
-- Checkout, CSAT y notificaciones no deben activarse hasta cerrar I-02, I-04 e I-05.

BEGIN;

CREATE TYPE cart_state AS ENUM (
  'ACTIVE',
  'MERGED',
  'CHECKED_OUT',
  'ABANDONED'
);

CREATE TYPE checkout_operation_state AS ENUM (
  'PREPARING',
  'PREPARED',
  'SUBMITTED',
  'SUCCEEDED',
  'FAILED'
);

CREATE TYPE post_delivery_prompt_state AS ENUM (
  'ELIGIBLE',
  'SHOWN',
  'DISMISSED',
  'SUBMITTED'
);

CREATE TYPE notification_delivery_type AS ENUM (
  'ORDER_CONFIRMATION',
  'SHIPMENT_UPDATE'
);

CREATE TYPE notification_delivery_state AS ENUM (
  'PENDING',
  'SENT',
  'FAILED',
  'SUPPRESSED'
);

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  anonymous_session_hash varchar(128),
  state cart_state NOT NULL DEFAULT 'ACTIVE',
  merged_into_cart_id uuid,
  currency char(3) NOT NULL DEFAULT 'PEN',
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  merged_at timestamptz,
  checked_out_at timestamptz,

  CONSTRAINT carts_owner_required_chk CHECK (
    (customer_id IS NOT NULL) <> (anonymous_session_hash IS NOT NULL)
  ),
  CONSTRAINT carts_anonymous_session_hash_chk CHECK (
    anonymous_session_hash IS NULL OR btrim(anonymous_session_hash) <> ''
  ),
  CONSTRAINT carts_currency_chk CHECK (currency = 'PEN'),
  CONSTRAINT carts_version_chk CHECK (version >= 0),
  CONSTRAINT carts_merge_state_chk CHECK (
    (
      state = 'MERGED'
      AND merged_into_cart_id IS NOT NULL
      AND merged_at IS NOT NULL
    )
    OR
    (
      state <> 'MERGED'
      AND merged_into_cart_id IS NULL
      AND merged_at IS NULL
    )
  ),
  CONSTRAINT carts_merged_source_anonymous_chk CHECK (
    state <> 'MERGED' OR anonymous_session_hash IS NOT NULL
  ),
  CONSTRAINT carts_checkout_state_chk CHECK (
    (state = 'CHECKED_OUT' AND checked_out_at IS NOT NULL)
    OR (state <> 'CHECKED_OUT' AND checked_out_at IS NULL)
  ),
  CONSTRAINT carts_lifecycle_time_chk CHECK (
    (merged_at IS NULL OR merged_at >= created_at)
    AND (checked_out_at IS NULL OR checked_out_at >= created_at)
  ),
  CONSTRAINT carts_not_merged_into_self_chk CHECK (merged_into_cart_id <> id),
  CONSTRAINT carts_merged_into_cart_fk FOREIGN KEY (merged_into_cart_id)
    REFERENCES carts (id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX carts_one_active_per_customer_uidx
  ON carts (customer_id)
  WHERE state = 'ACTIVE' AND customer_id IS NOT NULL;

CREATE UNIQUE INDEX carts_one_active_per_anonymous_session_uidx
  ON carts (anonymous_session_hash)
  WHERE state = 'ACTIVE' AND anonymous_session_hash IS NOT NULL;

CREATE INDEX carts_merged_into_cart_idx
  ON carts (merged_into_cart_id)
  WHERE merged_into_cart_id IS NOT NULL;

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL,
  sku varchar(100) NOT NULL,
  product_id varchar(100),
  variant_id varchar(100),
  quantity integer NOT NULL DEFAULT 1,
  unit_price_snapshot numeric(12, 2),
  price_version varchar(100),
  quoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT cart_items_cart_fk FOREIGN KEY (cart_id)
    REFERENCES carts (id)
    ON DELETE CASCADE,
  CONSTRAINT cart_items_cart_sku_uk UNIQUE (cart_id, sku),
  CONSTRAINT cart_items_sku_chk CHECK (btrim(sku) <> ''),
  CONSTRAINT cart_items_product_id_chk CHECK (
    product_id IS NULL OR btrim(product_id) <> ''
  ),
  CONSTRAINT cart_items_variant_id_chk CHECK (
    variant_id IS NULL OR btrim(variant_id) <> ''
  ),
  CONSTRAINT cart_items_quantity_chk CHECK (quantity BETWEEN 1 AND 99),
  CONSTRAINT cart_items_unit_price_chk CHECK (
    unit_price_snapshot IS NULL
    OR (
      unit_price_snapshot >= 0
      AND unit_price_snapshot <> 'NaN'::numeric
    )
  ),
  CONSTRAINT cart_items_price_snapshot_chk CHECK (
    (
      unit_price_snapshot IS NULL
      AND price_version IS NULL
      AND quoted_at IS NULL
    )
    OR
    (
      unit_price_snapshot IS NOT NULL
      AND price_version IS NOT NULL
      AND btrim(price_version) <> ''
      AND quoted_at IS NOT NULL
    )
  )
);

CREATE INDEX cart_items_product_id_idx
  ON cart_items (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX cart_items_variant_id_idx
  ON cart_items (variant_id)
  WHERE variant_id IS NOT NULL;

CREATE TABLE wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  product_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT wishlist_items_customer_product_uk
    UNIQUE (customer_id, product_id),
  CONSTRAINT wishlist_items_product_id_chk CHECK (btrim(product_id) <> '')
);

CREATE INDEX wishlist_items_customer_created_idx
  ON wishlist_items (customer_id, created_at DESC);

CREATE TABLE checkout_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  idempotency_key varchar(255) NOT NULL,
  request_fingerprint char(64) NOT NULL,
  state checkout_operation_state NOT NULL DEFAULT 'PREPARING',
  external_order_id varchar(100),
  failure_code varchar(100),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,

  CONSTRAINT checkout_operations_cart_fk FOREIGN KEY (cart_id)
    REFERENCES carts (id)
    ON DELETE RESTRICT,
  CONSTRAINT checkout_operations_customer_idempotency_uk
    UNIQUE (customer_id, idempotency_key),
  CONSTRAINT checkout_operations_idempotency_key_chk CHECK (
    btrim(idempotency_key) <> ''
  ),
  CONSTRAINT checkout_operations_fingerprint_chk CHECK (
    request_fingerprint ~ '^[0-9A-Fa-f]{64}$'
  ),
  CONSTRAINT checkout_operations_external_order_id_chk CHECK (
    external_order_id IS NULL OR btrim(external_order_id) <> ''
  ),
  CONSTRAINT checkout_operations_failure_code_chk CHECK (
    failure_code IS NULL OR btrim(failure_code) <> ''
  ),
  CONSTRAINT checkout_operations_result_chk CHECK (
    (
      state = 'SUCCEEDED'
      AND external_order_id IS NOT NULL
      AND failure_code IS NULL
      AND completed_at IS NOT NULL
    )
    OR
    (
      state = 'FAILED'
      AND external_order_id IS NULL
      AND failure_code IS NOT NULL
      AND completed_at IS NOT NULL
    )
    OR
    (
      state IN ('PREPARING', 'PREPARED', 'SUBMITTED')
      AND external_order_id IS NULL
      AND failure_code IS NULL
      AND completed_at IS NULL
    )
  ),
  CONSTRAINT checkout_operations_completion_time_chk CHECK (
    completed_at IS NULL OR completed_at >= created_at
  )
);

CREATE INDEX checkout_operations_cart_created_idx
  ON checkout_operations (cart_id, created_at DESC);

CREATE INDEX checkout_operations_state_created_idx
  ON checkout_operations (state, created_at);

CREATE INDEX checkout_operations_external_order_idx
  ON checkout_operations (external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE TABLE post_delivery_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  external_order_id varchar(100) NOT NULL,
  delivery_confirmed_at timestamptz NOT NULL,
  state post_delivery_prompt_state NOT NULL DEFAULT 'ELIGIBLE',
  eligible_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  shown_at timestamptz,
  dismissed_at timestamptz,
  submitted_at timestamptz,

  CONSTRAINT post_delivery_prompts_customer_order_uk
    UNIQUE (customer_id, external_order_id),
  CONSTRAINT post_delivery_prompts_external_order_id_chk CHECK (
    btrim(external_order_id) <> ''
  ),
  CONSTRAINT post_delivery_prompts_eligibility_time_chk CHECK (
    eligible_at >= delivery_confirmed_at
  ),
  CONSTRAINT post_delivery_prompts_state_timestamps_chk CHECK (
    (
      state = 'ELIGIBLE'
      AND shown_at IS NULL
      AND dismissed_at IS NULL
      AND submitted_at IS NULL
    )
    OR
    (
      state = 'SHOWN'
      AND shown_at IS NOT NULL
      AND dismissed_at IS NULL
      AND submitted_at IS NULL
    )
    OR
    (
      state = 'DISMISSED'
      AND shown_at IS NOT NULL
      AND dismissed_at IS NOT NULL
      AND submitted_at IS NULL
    )
    OR
    (
      state = 'SUBMITTED'
      AND shown_at IS NOT NULL
      AND submitted_at IS NOT NULL
    )
  ),
  CONSTRAINT post_delivery_prompts_timestamp_order_chk CHECK (
    (shown_at IS NULL OR shown_at >= eligible_at)
    AND (dismissed_at IS NULL OR dismissed_at >= shown_at)
    AND (submitted_at IS NULL OR submitted_at >= shown_at)
  )
);

CREATE INDEX post_delivery_prompts_customer_state_idx
  ON post_delivery_prompts (customer_id, state, eligible_at DESC);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_order_id varchar(100) NOT NULL,
  customer_id uuid NOT NULL,
  type notification_delivery_type NOT NULL,
  event_key varchar(255) NOT NULL,
  recipient_email_encrypted bytea NOT NULL,
  payload_version varchar(50) NOT NULL,
  state notification_delivery_state NOT NULL DEFAULT 'PENDING',
  provider_message_id varchar(255),
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT notification_deliveries_type_event_uk UNIQUE (type, event_key),
  CONSTRAINT notification_deliveries_external_order_id_chk CHECK (
    btrim(external_order_id) <> ''
  ),
  CONSTRAINT notification_deliveries_event_key_chk CHECK (
    btrim(event_key) <> ''
  ),
  CONSTRAINT notification_deliveries_recipient_chk CHECK (
    octet_length(recipient_email_encrypted) > 0
  ),
  CONSTRAINT notification_deliveries_payload_version_chk CHECK (
    btrim(payload_version) <> ''
  ),
  CONSTRAINT notification_deliveries_provider_message_id_chk CHECK (
    provider_message_id IS NULL OR btrim(provider_message_id) <> ''
  ),
  CONSTRAINT notification_deliveries_attempt_count_chk CHECK (
    attempt_count >= 0
  ),
  CONSTRAINT notification_deliveries_attempt_time_chk CHECK (
    (attempt_count = 0 AND last_attempt_at IS NULL)
    OR (attempt_count > 0 AND last_attempt_at IS NOT NULL)
  ),
  CONSTRAINT notification_deliveries_sent_state_chk CHECK (
    (
      state = 'SENT'
      AND sent_at IS NOT NULL
      AND attempt_count > 0
      AND sent_at >= last_attempt_at
    )
    OR (state <> 'SENT' AND sent_at IS NULL)
  ),
  CONSTRAINT notification_deliveries_failure_attempt_chk CHECK (
    state <> 'FAILED' OR attempt_count > 0
  ),
  CONSTRAINT notification_deliveries_audit_time_chk CHECK (
    (last_attempt_at IS NULL OR last_attempt_at >= created_at)
    AND (sent_at IS NULL OR sent_at >= created_at)
  )
);

CREATE INDEX notification_deliveries_state_created_idx
  ON notification_deliveries (state, created_at)
  WHERE state IN ('PENDING', 'FAILED');

CREATE INDEX notification_deliveries_order_idx
  ON notification_deliveries (external_order_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = statement_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_cart_merge_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = 'MERGED' THEN
    PERFORM 1
    FROM carts
    WHERE id = NEW.merged_into_cart_id
      AND state = 'ACTIVE'
      AND customer_id IS NOT NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'A merged cart must reference an active authenticated cart'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_active_cart_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_cart_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.cart_id <> OLD.cart_id THEN
    RAISE EXCEPTION
      'A cart item cannot be moved to another cart'
      USING ERRCODE = 'check_violation';
  END IF;

  target_cart_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cart_id ELSE NEW.cart_id END;

  PERFORM 1
  FROM carts
  WHERE id = target_cart_id
    AND state = 'ACTIVE'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Cart items can only be mutated while their cart is active'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER carts_set_updated_at
BEFORE UPDATE ON carts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cart_items_set_updated_at
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER carts_validate_merge_target
BEFORE INSERT OR UPDATE OF state, merged_into_cart_id ON carts
FOR EACH ROW
EXECUTE FUNCTION validate_cart_merge_target();

CREATE TRIGGER cart_items_validate_active_cart
BEFORE INSERT OR UPDATE OR DELETE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION validate_active_cart_item_mutation();

COMMENT ON TABLE carts IS
  'Carritos locales del Marketplace. Cada carrito pertenece a un cliente o a una sesión anónima.';
COMMENT ON COLUMN carts.anonymous_session_hash IS
  'Hash del secreto de la cookie anónima; nunca contiene el secreto en claro.';
COMMENT ON COLUMN carts.version IS
  'Versión de concurrencia optimista, incrementada por la aplicación en cada mutación de líneas o fusión.';

COMMENT ON TABLE cart_items IS
  'Líneas locales de carrito identificadas comercialmente por SKU.';
COMMENT ON COLUMN cart_items.unit_price_snapshot IS
  'Precio informativo transitorio; debe revalidarse antes del checkout.';

COMMENT ON TABLE wishlist_items IS
  'Favoritos locales a nivel de producto para clientes autenticados.';

COMMENT ON TABLE checkout_operations IS
  'Control local de idempotencia del checkout; no representa un pedido ni almacena datos financieros sensibles.';
COMMENT ON COLUMN checkout_operations.external_order_id IS
  'Referencia externa de Ventas y Postventa, sin clave foránea entre bases de datos.';

COMMENT ON TABLE post_delivery_prompts IS
  'Estado UX local de la invitación postentrega; la respuesta CSAT pertenece a Ventas y Postventa.';

COMMENT ON TABLE notification_deliveries IS
  'Registro local idempotente de salida para correos transaccionales.';
COMMENT ON COLUMN notification_deliveries.recipient_email_encrypted IS
  'Correo cifrado por la aplicación. No debe escribirse en logs ni almacenarse en claro.';

COMMIT;
