-- Trazabilidad por código físico: venta exacta + historial append-only.
-- Aditiva e idempotente. Ejecutar antes del backend B2.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid;

DO $$ BEGIN
  ALTER TABLE sale_items
    ADD CONSTRAINT "FK_sale_items_stock_unit"
    FOREIGN KEY (stock_unit_id) REFERENCES stock_units(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "IDX_sale_items_stock_unit"
  ON sale_items (stock_unit_id);

DO $$ BEGIN
  CREATE TYPE stock_unit_event_type_enum AS ENUM (
    'RECEIVED', 'CONTENT_UPDATED', 'PRINTED', 'SPLIT', 'CREATED_FROM_BOX',
    'SOLD', 'CONSIGNED', 'RETURNED', 'WRITTEN_OFF', 'TRANSFERRED', 'IMPORTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stock_unit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid,
  stock_unit_id  uuid NOT NULL REFERENCES stock_units(id) ON DELETE RESTRICT,
  event_type     stock_unit_event_type_enum NOT NULL,
  from_status    varchar,
  to_status      varchar,
  reference_type varchar,
  reference_id   uuid,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_stock_unit_events_trace"
  ON stock_unit_events (tenant_id, stock_unit_id, created_at);
