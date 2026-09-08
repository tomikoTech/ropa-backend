-- ¿Por qué al escanear este código dice que no está disponible? Solo LEE.
--
-- El punto de venta rechaza un código por razones distintas y cada una tiene su
-- mensaje. Esta consulta trae, de un golpe, todo lo que esas razones miran:
--
--   · ¿existe el bulto con ese código exacto? (largo incluido)
--   · ¿en qué estado está? (vendido, abierto, dado de baja…)
--   · ¿tiene variante asociada? sin ella el POS no sabe qué vender
--   · ¿en qué bodega está? escanear el de otra bodega también se rechaza
--   · ¿cuánto dice el agregado de esa variante en esa bodega?
--
-- Uso:
--   psql "$PROD_DB_URL" -v tenant="'amawad'" -v codigo="'26090800010040019'" \
--     -f scripts/por-que-no-escanea.sql

\set ON_ERROR_STOP on

\echo ''
\echo '── ¿Existe ese código, tal cual? ──'

SELECT su.barcode                         AS codigo,
       length(su.barcode)                 AS "cuántos dígitos",
       su.status                          AS estado,
       su.kind                            AS tipo,
       su.quantity                        AS unidades,
       w.name                             AS bodega,
       p.name                             AS producto,
       pv.sku                             AS variante,
       CASE WHEN su.variant_id IS NULL
            THEN 'SIN VARIANTE — el POS no puede venderlo'
            ELSE 'ok' END                 AS "variante asociada",
       s.quantity                         AS "agregado de esa variante ahí"
FROM stock_units su
JOIN tenants t            ON t.id = su.tenant_id AND t.slug = :tenant
LEFT JOIN warehouses w    ON w.id = su.warehouse_id
LEFT JOIN products p      ON p.id = su.product_id
LEFT JOIN product_variants pv ON pv.id = su.variant_id
LEFT JOIN stock s         ON s.variant_id = su.variant_id
                         AND s.warehouse_id = su.warehouse_id
                         AND s.tenant_id = su.tenant_id
WHERE su.barcode = :'codigo';

\echo ''
\echo '── ¿Y si el lector lee de más o de menos? Códigos parecidos ──'

SELECT su.barcode AS codigo, su.status AS estado, su.kind AS tipo
FROM stock_units su
JOIN tenants t ON t.id = su.tenant_id AND t.slug = :tenant
WHERE su.barcode LIKE left(:'codigo', 12) || '%'
ORDER BY su.barcode;

\echo ''
\echo '── ¿Choca con el código de alguna variante? (los del catálogo) ──'

SELECT pv.barcode AS "código de variante", p.name AS producto, pv.sku
FROM product_variants pv
JOIN tenants t   ON t.id = pv.tenant_id AND t.slug = :tenant
JOIN products p  ON p.id = pv.product_id
WHERE pv.barcode = :'codigo';
