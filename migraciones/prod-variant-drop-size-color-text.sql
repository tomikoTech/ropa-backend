-- Fase 1c (CONTRACT): elimina las columnas de texto de la variante.
--
-- ⚠️ CORRER **DESPUÉS** de desplegar el backend que ya usa `sizeName`/`colorName`,
--    NO antes. Mientras el backend viejo esté vivo sigue leyendo `size`/`color`.
--
-- Orden completo de la migración:
--   1. prod-catalogs-sizes-colors.sql        (crea sizes/colors)
--   2. prod-variant-size-color-fk.sql        (agrega size_id/color_id + FK)
--   3. node dist/seeds/backfill-catalogs.js  (puebla catálogo y vincula FK)
--   4. desplegar backend nuevo
--   5. este archivo                          (elimina el texto heredado)
--
-- Comprobación previa OBLIGATORIA: no debe quedar ninguna variante con texto
-- pero sin FK, o se perdería información al soltar las columnas.
--
-- La comprobación se salta sola si las columnas ya no están (o sea, si esto ya
-- se corrió): sin ese `IF`, volver a ejecutarlo fallaba con "column size does
-- not exist", y eso tumbaría el arranque al correr las migraciones.
DO $$
DECLARE
  huerfanas integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'product_variants' AND column_name IN ('size', 'color')
  ) THEN
    EXECUTE $q$
      SELECT COUNT(*)
        FROM product_variants
       WHERE (COALESCE(TRIM(size), '')  <> '' AND size_id  IS NULL)
          OR (COALESCE(TRIM(color), '') <> '' AND color_id IS NULL)
    $q$ INTO huerfanas;

    IF huerfanas > 0 THEN
      RAISE EXCEPTION
        'Hay % variante(s) con talla/color en texto pero sin FK. Corre backfill-catalogs antes de soltar las columnas.',
        huerfanas;
    END IF;
  END IF;
END $$;

ALTER TABLE product_variants DROP COLUMN IF EXISTS size;
ALTER TABLE product_variants DROP COLUMN IF EXISTS color;
