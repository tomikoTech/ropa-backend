-- Fase 6: conteo físico de inventario (las "verificaciones" del sistema anterior).
-- Correr en prod ANTES de desplegar el backend nuevo.
--
-- Se abre una ventana de conteo, se escanea lo que hay, y al cerrarla se
-- comparan las cantidades contra las del sistema. Las diferencias se calculan,
-- no se guardan, para que no puedan contradecir al conteo.

DO $$ BEGIN
  CREATE TYPE inventory_count_status_enum AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inventory_counts (
  id           uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  count_number varchar                     NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  status       inventory_count_status_enum NOT NULL DEFAULT 'OPEN',
  started_at   timestamptz                 NOT NULL,
  closed_at    timestamptz,
  notes        text,
  created_by   uuid,
  created_at   timestamptz                 NOT NULL DEFAULT now(),
  updated_at   timestamptz                 NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid,
  count_id         uuid NOT NULL REFERENCES inventory_counts(id)  ON DELETE CASCADE,
  variant_id       uuid NOT NULL REFERENCES product_variants(id)  ON DELETE RESTRICT,
  counted_quantity integer     NOT NULL DEFAULT 0,
  expected_quantity integer    NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_count_lines
  ADD COLUMN IF NOT EXISTS expected_quantity integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_count_expected_units (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,
  count_id      uuid        NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  stock_unit_id uuid        NOT NULL REFERENCES stock_units(id) ON DELETE RESTRICT,
  barcode       varchar     NOT NULL,
  quantity      integer     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_count_scans (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid,
  count_id       uuid        NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  client_scan_id varchar     NOT NULL,
  device_id      varchar,
  barcode        varchar     NOT NULL,
  stock_unit_id  uuid        REFERENCES stock_units(id) ON DELETE RESTRICT,
  result         varchar     NOT NULL,
  quantity       integer     NOT NULL DEFAULT 0,
  message        text        NOT NULL,
  scanned_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_counts_tenant_number"
  ON inventory_counts (tenant_id, count_number);
-- Una variante aparece una sola vez por conteo: lo contado se acumula ahi.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_count_lines_count_variant"
  ON inventory_count_lines (count_id, variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_count_expected_unit"
  ON inventory_count_expected_units (count_id, stock_unit_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_count_scan_client"
  ON inventory_count_scans (count_id, client_scan_id);
CREATE INDEX IF NOT EXISTS "IDX_inventory_count_expected_count"
  ON inventory_count_expected_units (tenant_id, count_id);
CREATE INDEX IF NOT EXISTS "IDX_inventory_count_scans_count_created"
  ON inventory_count_scans (tenant_id, count_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "IDX_inventory_counts_wh" ON inventory_counts (tenant_id, warehouse_id, status);
