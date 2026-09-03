-- ============================================================================
-- amawad · Borrar TODO el inventario (existencias), CONSERVANDO terceros
-- ============================================================================
--
-- Qué BORRA (solo tenant amawad):
--   - stock                (existencias agregadas por variante/bodega)
--   - stock_units          (cada par/caja con su código) que NO esté ya vendido
--   - stock_unit_events    (eventos de esas unidades)
--   - stock_unit_contents  (contenido de cajas de esas unidades)
--   - stock_movements      (ledger de movimientos)
--   - stock_transfers      (traslados)
--   - inventory_counts      (conteos físicos + cascada: líneas/scans/esperados)
--                           → esto suelta las unidades IN_STOCK que un conteo
--                             tenía "agarradas", para poder borrarlas de verdad
--
-- Qué CONSERVA:
--   - products, product_variants   (el catálogo queda, en cero)
--   - sales / purchases / returns  (historial intacto)
--   - consignments, third_party_products  (TERCEROS: no se tocan)
--   - unidades ya vendidas/referenciadas: se conservan para no romper historial
--     (una unidad vendida no es "existencia"; queda como historia de esa venta)
--
-- Uso:
--   Dry-run (no aplica nada, solo muestra el antes/después y hace ROLLBACK):
--     psql "$PROD_DB_URL" -f amawad-borrar-existencias.sql
--   Aplicar de verdad (COMMIT):
--     psql "$PROD_DB_URL" -v apply=1 -f amawad-borrar-existencias.sql
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

-- 1) Resolver tenant (falla si no hay exactamente uno) -----------------------
SELECT id AS tid FROM tenants WHERE slug = 'amawad' \gset

\echo '=== tenant amawad ==='
\echo :tid

-- 2) ANTES -------------------------------------------------------------------
\echo '=== ANTES ==='
SELECT
  (SELECT count(*) FROM stock              WHERE tenant_id = :'tid') AS stock,
  (SELECT count(*) FROM stock_units        WHERE tenant_id = :'tid') AS units,
  (SELECT count(*) FROM stock_unit_events  WHERE tenant_id = :'tid') AS unit_events,
  (SELECT count(*) FROM stock_movements    WHERE tenant_id = :'tid') AS movements,
  (SELECT count(*) FROM stock_transfers    WHERE tenant_id = :'tid') AS transfers,
  (SELECT count(*) FROM inventory_counts   WHERE tenant_id = :'tid') AS conteos,
  (SELECT count(*) FROM consignments       WHERE tenant_id = :'tid') AS consignments_terceros,
  (SELECT count(*) FROM third_party_products WHERE tenant_id = :'tid') AS libreta_terceros;

-- 3) Borrar los conteos físicos PRIMERO (cascada a líneas/scans/esperados).
--    Así las unidades IN_STOCK que un conteo tenía referenciadas quedan libres
--    y entran en el conjunto borrable de abajo. Un conteo de un inventario que
--    va a desaparecer no significa nada; no toca ventas/compras ni terceros.
DELETE FROM inventory_counts WHERE tenant_id = :'tid';

-- 4) Unidades borrables = del tenant y NO referenciadas por historial --------
CREATE TEMP TABLE _borrables ON COMMIT DROP AS
SELECT su.id
FROM stock_units su
WHERE su.tenant_id = :'tid'
  AND NOT EXISTS (SELECT 1 FROM sale_items si
                    WHERE si.stock_unit_id = su.id)
  AND NOT EXISTS (SELECT 1 FROM return_items ri
                    WHERE ri.stock_unit_id = su.id
                       OR ri.replacement_stock_unit_id = su.id)
  AND NOT EXISTS (SELECT 1 FROM inventory_count_scans cs
                    WHERE cs.stock_unit_id = su.id)
  AND NOT EXISTS (SELECT 1 FROM inventory_count_expected_units eu
                    WHERE eu.stock_unit_id = su.id)
  AND NOT EXISTS (SELECT 1 FROM internal_request_units iu
                    WHERE iu.stock_unit_id = su.id);

\echo '=== unidades a borrar vs. conservadas por historial ==='
SELECT
  (SELECT count(*) FROM _borrables) AS unidades_a_borrar,
  (SELECT count(*) FROM stock_units su
     WHERE su.tenant_id = :'tid'
       AND su.id NOT IN (SELECT id FROM _borrables)) AS unidades_conservadas_por_referencia;

-- 5) Borrar (orden por FKs) --------------------------------------------------
-- eventos de las unidades borrables (FK RESTRICT → van primero)
DELETE FROM stock_unit_events
 WHERE stock_unit_id IN (SELECT id FROM _borrables);

-- contenido de cajas borrables (CASCADE lo haría, pero explícito)
DELETE FROM stock_unit_contents
 WHERE box_unit_id IN (SELECT id FROM _borrables);

-- las unidades
DELETE FROM stock_units
 WHERE id IN (SELECT id FROM _borrables);

-- existencias agregadas: reset total del tenant
DELETE FROM stock          WHERE tenant_id = :'tid';

-- ledger de movimientos
DELETE FROM stock_movements WHERE tenant_id = :'tid';

-- traslados
DELETE FROM stock_transfers WHERE tenant_id = :'tid';

-- 6) DESPUÉS -----------------------------------------------------------------
\echo '=== DESPUÉS ==='
SELECT
  (SELECT count(*) FROM stock              WHERE tenant_id = :'tid') AS stock,
  (SELECT count(*) FROM stock_units        WHERE tenant_id = :'tid') AS units,
  (SELECT count(*) FROM stock_unit_events  WHERE tenant_id = :'tid') AS unit_events,
  (SELECT count(*) FROM stock_movements    WHERE tenant_id = :'tid') AS movements,
  (SELECT count(*) FROM stock_transfers    WHERE tenant_id = :'tid') AS transfers,
  (SELECT count(*) FROM inventory_counts   WHERE tenant_id = :'tid') AS conteos,
  (SELECT count(*) FROM consignments       WHERE tenant_id = :'tid') AS consignments_terceros,
  (SELECT count(*) FROM third_party_products WHERE tenant_id = :'tid') AS libreta_terceros;

-- 7) Aplicar o revertir ------------------------------------------------------
\if :apply
  COMMIT;
  \echo '>>> APLICADO (COMMIT). Existencias de amawad borradas; terceros intactos.'
\else
  ROLLBACK;
  \echo '>>> DRY-RUN (ROLLBACK): no se cambió nada. Corre con  -v apply=1  para aplicar.'
\endif
