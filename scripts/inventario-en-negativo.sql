-- ¿Qué tan descuadrado está el inventario? Solo LEE.
--
-- Dos problemas distintos que conviene no confundir:
--
--  1. **Saldo negativo.** `stock.quantity` por debajo de cero. Es imposible
--     —no hay bodegas con menos uno— y significa que algo descontó de más.
--     Ningún script lo arreglaba: `reconciliar:bultos` da por bueno el
--     agregado, así que un negativo se lo lleva por delante.
--
--  2. **Agregado ≠ etiquetas.** El total por variante no coincide con los
--     bultos que lo respaldan. Eso sí lo cuadra `reconciliar:bultos`.
--
-- Uso:
--   psql "$PROD_DB_URL" -v tenant="'amawad'" -f scripts/inventario-en-negativo.sql

\set ON_ERROR_STOP on

\echo ''
\echo '── 1. Saldos NEGATIVOS (imposibles) ──'

SELECT p.name        AS producto,
       pv.sku        AS variante,
       w.name        AS bodega,
       s.quantity    AS saldo
FROM stock s
JOIN tenants t           ON t.id = s.tenant_id AND t.slug = :tenant
JOIN product_variants pv ON pv.id = s.variant_id
JOIN products p          ON p.id = pv.product_id
JOIN warehouses w        ON w.id = s.warehouse_id
WHERE s.quantity < 0
ORDER BY s.quantity ASC;

\echo ''
\echo '── 2. El agregado contra los bultos etiquetados ──'

WITH etiquetadas AS (
  SELECT su.variant_id, su.warehouse_id, SUM(su.quantity)::int AS u
  FROM stock_units su
  JOIN tenants t ON t.id = su.tenant_id AND t.slug = :tenant
  WHERE su.status = 'IN_STOCK' AND su.variant_id IS NOT NULL
  GROUP BY 1, 2
),
agregado AS (
  SELECT s.variant_id, s.warehouse_id, s.quantity::int AS u
  FROM stock s
  JOIN tenants t ON t.id = s.tenant_id AND t.slug = :tenant
)
SELECT p.name                     AS producto,
       pv.sku                     AS variante,
       w.name                     AS bodega,
       COALESCE(a.u, 0)           AS agregado,
       COALESCE(e.u, 0)           AS "unidades etiquetadas",
       COALESCE(a.u, 0) - COALESCE(e.u, 0) AS diferencia,
       CASE
         WHEN COALESCE(a.u, 0) < 0 THEN 'saldo negativo: hay que subirlo a cero'
         WHEN COALESCE(a.u, 0) > COALESCE(e.u, 0) THEN 'faltan etiquetas'
         ELSE 'sobran etiquetas'
       END                        AS "qué pasa"
FROM agregado a
FULL OUTER JOIN etiquetadas e
  ON e.variant_id = a.variant_id AND e.warehouse_id = a.warehouse_id
JOIN product_variants pv ON pv.id = COALESCE(a.variant_id, e.variant_id)
JOIN products p          ON p.id = pv.product_id
JOIN warehouses w        ON w.id = COALESCE(a.warehouse_id, e.warehouse_id)
WHERE COALESCE(a.u, 0) <> COALESCE(e.u, 0)
ORDER BY p.name, pv.sku, w.name;

\echo ''
\echo '── 3. Los movimientos que dejaron saldo en negativo ──'

SELECT sm.created_at   AS cuando,
       sm.movement_type AS movimiento,
       sm.reference_type AS documento,
       sm.quantity     AS cantidad,
       w.name          AS bodega,
       sm.notes        AS nota
FROM stock_movements sm
JOIN tenants t     ON t.id = sm.tenant_id AND t.slug = :tenant
JOIN warehouses w  ON w.id = sm.warehouse_id
WHERE sm.notes ILIKE '%saldo quedó en -%'
ORDER BY sm.created_at DESC
LIMIT 30;
