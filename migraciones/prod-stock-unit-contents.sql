-- Contenido esperado/real de cada caja física.
-- Aditiva e idempotente. Ejecutar antes del backend que expone
-- POST /stock-units/:id/contents.

CREATE TABLE IF NOT EXISTS stock_unit_contents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  box_unit_id       uuid NOT NULL REFERENCES stock_units(id) ON DELETE CASCADE,
  size_id           uuid NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  variant_id        uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  expected_quantity integer NOT NULL DEFAULT 0 CHECK (expected_quantity >= 0),
  actual_quantity   integer NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_stock_unit_contents_box_size" UNIQUE (box_unit_id, size_id)
);

CREATE INDEX IF NOT EXISTS "IDX_stock_unit_contents_tenant"
  ON stock_unit_contents (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_stock_unit_contents_box"
  ON stock_unit_contents (box_unit_id);
