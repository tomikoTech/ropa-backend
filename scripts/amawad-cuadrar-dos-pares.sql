-- Los dos pares que quedaron colgando después de anular la VTA-20260908-0005.
--
-- Qué pasó: durante la tarde de ediciones se excluyeron dos pares sueltos de
-- esa factura, y el agregado bajó en uno por referencia. Al anular la venta,
-- el inventario repuso el **neto** de sus movimientos —que ya venía con esos
-- dos de menos—, así que las cajas volvieron completas pero el agregado quedó
-- uno corto en dos referencias.
--
-- La verdad física es la etiqueta: las seis cajas están cerradas y completas.
--   · AMA MAYLU 96/97 ALO D          → 2 cajas = 48 pares (el agregado dice 47)
--   · AMA MAYLU 9/10/11/12 VOMERO H  → 4 cajas = 96 pares (el agregado dice 95)
--
-- Uso, desde tu propia terminal:
--   psql "$PROD_DB_URL"              -f scripts/amawad-cuadrar-dos-pares.sql
--   psql "$PROD_DB_URL" -v aplicar=1 -f scripts/amawad-cuadrar-dos-pares.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE puntos ON COMMIT DROP AS
SELECT st.variant_id, st.warehouse_id, st.tenant_id,
       st.quantity AS agregado,
       COALESCE((SELECT SUM(u.quantity) FROM stock_units u
                  WHERE u.variant_id = st.variant_id
                    AND u.warehouse_id = st.warehouse_id
                    AND u.status = 'IN_STOCK'), 0) AS etiquetas
FROM stock st
JOIN tenants t ON t.id = st.tenant_id AND t.slug = 'amawad'
WHERE st.quantity <> COALESCE((SELECT SUM(u.quantity) FROM stock_units u
        WHERE u.variant_id = st.variant_id
          AND u.warehouse_id = st.warehouse_id
          AND u.status = 'IN_STOCK'), 0);

\echo ''
\echo '── Qué se va a cuadrar ──'
SELECT p.name AS producto, w.name AS bodega, x.agregado, x.etiquetas,
       x.etiquetas - x.agregado AS ajuste
FROM puntos x
JOIN product_variants v ON v.id = x.variant_id
JOIN products p ON p.id = v.product_id
JOIN warehouses w ON w.id = x.warehouse_id
ORDER BY p.name;

-- Salvaguarda: esto arregla un desfase de pocos pares, no un descuadre grande.
-- Si alguna vez encuentra más, hay otra cosa pasando y hay que mirarla.
DO $$
DECLARE grande int;
BEGIN
  SELECT count(*) INTO grande FROM puntos WHERE abs(etiquetas - agregado) > 2;
  IF grande > 0 THEN
    RAISE EXCEPTION 'Hay % punto(s) con más de 2 pares de diferencia: revísalo a mano', grande;
  END IF;
END $$;

\if :{?aplicar}
  \echo ''
  \echo '── Aplicando ──'

  UPDATE stock st SET quantity = x.etiquetas, updated_at = now()
    FROM puntos x
   WHERE st.variant_id = x.variant_id AND st.warehouse_id = x.warehouse_id;

  INSERT INTO stock_movements
        (id, tenant_id, variant_id, warehouse_id, movement_type, reference_type,
         reference_id, quantity, notes, created_at)
  SELECT gen_random_uuid(), x.tenant_id, x.variant_id, x.warehouse_id,
         (CASE WHEN x.etiquetas > x.agregado THEN 'IN' ELSE 'OUT' END)::stock_movements_movement_type_enum,
         'ADJUSTMENT', NULL, x.etiquetas - x.agregado,
         'Cuadre con las etiquetas tras anular la VTA-20260908-0005: las cajas están cerradas y completas',
         now()
  FROM puntos x;

  \echo 'Listo.'
\else
  \echo ''
  \echo 'Ensayo: no se cambió nada. Para aplicarlo, añade  -v aplicar=1'
\endif

COMMIT;
