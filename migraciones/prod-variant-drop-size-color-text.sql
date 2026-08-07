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
DO $$
DECLARE
  huerfanas integer;
BEGIN
  SELECT COUNT(*) INTO huerfanas
    FROM product_variants
   WHERE (COALESCE(TRIM(size), '')  <> '' AND size_id  IS NULL)
      OR (COALESCE(TRIM(color), '') <> '' AND color_id IS NULL);

  IF huerfanas > 0 THEN
    RAISE EXCEPTION
      'Hay % variante(s) con talla/color en texto pero sin FK. Corre backfill-catalogs antes de soltar las columnas.',
      huerfanas;
  END IF;
END $$;

ALTER TABLE product_variants DROP COLUMN IF EXISTS size;
ALTER TABLE product_variants DROP COLUMN IF EXISTS color;
