-- Fase 1b: talla y color de la variante pasan a CLAVE FORÁNEA.
-- Correr en prod ANTES de desplegar el backend nuevo.
-- Requiere haber corrido antes: prod-catalogs-sizes-colors.sql
--
-- Patrón expand-migrate-contract (3 pasos, sin downtime):
--   [1] EXPAND   <- este archivo: agrega size_id/color_id sin quitar nada.
--                   El backend anterior sigue funcionando con las columnas de
--                   texto mientras se despliega el nuevo.
--   [2] MIGRATE  <- node dist/seeds/backfill-catalogs.js  (vincula las FK)
--   [3] CONTRACT <- prod-variant-drop-size-color-text.sql (elimina el texto),
--                   solo cuando ya no quede código leyendo variant.size/color.

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size_id  uuid;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_id uuid;

-- ON DELETE RESTRICT: borrar del catálogo una talla en uso debe fallar, no
-- dejar variantes huérfanas en silencio. El servicio ya avisa antes de borrar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_product_variants_size'
  ) THEN
    ALTER TABLE product_variants
      ADD CONSTRAINT "FK_product_variants_size"
      FOREIGN KEY (size_id) REFERENCES sizes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_product_variants_color'
  ) THEN
    ALTER TABLE product_variants
      ADD CONSTRAINT "FK_product_variants_color"
      FOREIGN KEY (color_id) REFERENCES colors(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Índices: se filtra y agrupa por talla/color constantemente (inventario,
-- reportes, curvas). Sin ellos la FK no aporta rendimiento.
CREATE INDEX IF NOT EXISTS "IDX_product_variants_size"  ON product_variants (size_id);
CREATE INDEX IF NOT EXISTS "IDX_product_variants_color" ON product_variants (color_id);
