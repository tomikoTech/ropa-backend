-- Fase 4: inventario por unidades etiquetadas (bultos con código de barras).
-- Correr en prod ANTES de desplegar el backend nuevo.
-- Requiere: prod-shelves-stands-unit-tracking.sql y prod-purchase-boxes-landed-cost.sql
--
-- Capa granular que convive con `stock` (que sigue siendo el agregado por
-- variante y bodega). Solo se llena para productos con unit_tracking, así que
-- los tenants actuales no se ven afectados.

DO $$ BEGIN
  CREATE TYPE stock_unit_kind_enum AS ENUM ('BOX', 'UNIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stock_unit_status_enum AS ENUM
    ('IN_STOCK', 'SOLD', 'CONSIGNED', 'TRANSFERRED', 'WRITTEN_OFF', 'SPLIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stock_units (
  id                   uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid,
  barcode              varchar                NOT NULL,
  kind                 stock_unit_kind_enum   NOT NULL,
  status               stock_unit_status_enum NOT NULL DEFAULT 'IN_STOCK',
  product_id           uuid NOT NULL REFERENCES products(id)         ON DELETE RESTRICT,
  color_id             uuid          REFERENCES colors(id)           ON DELETE RESTRICT,
  size_id              uuid          REFERENCES sizes(id)            ON DELETE RESTRICT,
  variant_id           uuid          REFERENCES product_variants(id) ON DELETE SET NULL,
  warehouse_id         uuid NOT NULL REFERENCES warehouses(id)       ON DELETE RESTRICT,
  stand_id             uuid          REFERENCES stands(id)           ON DELETE SET NULL,
  quantity             integer       NOT NULL DEFAULT 1,
  cost                 numeric(14,2) NOT NULL DEFAULT 0,
  purchase_box_line_id uuid,
  parent_unit_id       uuid,
  printed_at           timestamptz,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

-- El código impreso es único por tienda: es lo que se escanea para vender.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_units_tenant_barcode"
  ON stock_units (tenant_id, barcode);

-- Consulta más frecuente: qué hay disponible en una bodega.
CREATE INDEX IF NOT EXISTS "IDX_stock_units_wh_status"
  ON stock_units (tenant_id, warehouse_id, status);
CREATE INDEX IF NOT EXISTS "IDX_stock_units_box_line" ON stock_units (purchase_box_line_id);
CREATE INDEX IF NOT EXISTS "IDX_stock_units_parent"   ON stock_units (parent_unit_id);
