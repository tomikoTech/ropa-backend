-- Fase 3: compra por cajas y costeo de importación (landed cost).
-- Correr en prod ANTES de desplegar el backend nuevo.
-- Requiere: prod-size-curves.sql y prod-catalogs-sizes-colors.sql.
--
-- Todo es ADITIVO: las órdenes de compra existentes siguen igual. Los campos
-- de importación quedan en valores neutros (tasa 1, sin fletes), así que una
-- compra local no cambia en nada.

-- ── Costeo de importación en la orden ────────────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(14,4) NOT NULL DEFAULT 1;
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS freight_costs jsonb NOT NULL DEFAULT '[]';
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS freight_allocation varchar NOT NULL DEFAULT 'BY_UNITS';
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS arrival_date date;

-- ── Renglones por caja ───────────────────────────────────────────────────
-- Una caja NO es una variante: trae varias tallas a la vez (las de la curva),
-- por eso la línea apunta a producto + color y no a variant_id.
CREATE TABLE IF NOT EXISTS purchase_box_lines (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  purchase_order_id uuid          NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        uuid          NOT NULL REFERENCES products(id)        ON DELETE RESTRICT,
  color_id          uuid          REFERENCES colors(id)                    ON DELETE RESTRICT,
  size_curve_id     uuid          REFERENCES size_curves(id)               ON DELETE RESTRICT,
  boxes             integer       NOT NULL,
  units_per_box     integer       NOT NULL,
  unit_cost         numeric(14,2) NOT NULL,
  sale_price        numeric(14,2),
  consecutive       integer       NOT NULL,
  boxes_received    integer       NOT NULL DEFAULT 0,
  comment           text,
  is_active         boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_purchase_box_lines_tenant" ON purchase_box_lines (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_purchase_box_lines_order"  ON purchase_box_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS "IDX_purchase_box_lines_curve"  ON purchase_box_lines (size_curve_id);
