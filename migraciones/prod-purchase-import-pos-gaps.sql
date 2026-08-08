-- Cierre de F3/F5: importación de compras (sin esquema nuevo) y paridad POS.
-- Aditiva e idempotente. Correr ANTES del backend nuevo.

ALTER TYPE sales_sale_channel_enum ADD VALUE IF NOT EXISTS 'INSTAGRAM';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS minimum_sale_price numeric(12,2);

CREATE TABLE IF NOT EXISTS sales_promoters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid,
  name       varchar NOT NULL,
  phone      varchar,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sales_promoters_tenant_name"
  ON sales_promoters (tenant_id, name);
CREATE INDEX IF NOT EXISTS "IDX_sales_promoters_tenant"
  ON sales_promoters (tenant_id);

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS promoter_id uuid,
  ADD COLUMN IF NOT EXISTS promoter_name varchar;

CREATE INDEX IF NOT EXISTS "IDX_sale_items_promoter"
  ON sale_items (tenant_id, promoter_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'FK_sale_items_promoter'
  ) THEN
    ALTER TABLE sale_items
      ADD CONSTRAINT "FK_sale_items_promoter"
      FOREIGN KEY (promoter_id) REFERENCES sales_promoters(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Cajas recibidas antes de este despliegue: enlazar una variante compatible
-- para que el POS pueda venderlas. La caja conserva producto/color/curva como
-- fuente de verdad; esta FK es el puente con el stock agregado.
UPDATE stock_units su
SET variant_id = (
  SELECT pv.id
  FROM product_variants pv
  WHERE pv.product_id = su.product_id
    AND pv.tenant_id IS NOT DISTINCT FROM su.tenant_id
    AND (su.color_id IS NULL OR pv.color_id = su.color_id)
    AND (su.size_id IS NULL OR pv.size_id = su.size_id)
    AND pv.is_active = true
  ORDER BY pv.created_at, pv.id
  LIMIT 1
)
WHERE su.variant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM product_variants pv
    WHERE pv.product_id = su.product_id
      AND pv.tenant_id IS NOT DISTINCT FROM su.tenant_id
      AND (su.color_id IS NULL OR pv.color_id = su.color_id)
      AND (su.size_id IS NULL OR pv.size_id = su.size_id)
      AND pv.is_active = true
  );

-- Verificación:
-- SELECT count(*) FROM sales_promoters;
-- SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
--   WHERE t.typname='sales_sale_channel_enum' AND enumlabel='INSTAGRAM';
