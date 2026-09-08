-- AMAWAD: el precio mayorista quedó cargado con el COSTO.
--
-- Qué pasó. `products.wholesale_price` trae el mismo número que el costo:
--
--     AMA MAYLU 44/45 …   mayorista 74    costo 74    lista 83
--     AMA CHOCO 7 1/2 H   mayorista 191   costo 191   lista 221
--     AMA CHOCO 01/02 …   mayorista 197   costo 197   lista 227
--
-- Y como **una caja se cobra al por mayor** —es la regla, y es la correcta—,
-- el POS proponía el costo en cada venta de caja. Se ve en las facturas: el
-- vendedor lo corregía a mano una por una (cobró 221 donde le proponían 191).
--
-- El arreglo es borrar ese precio, no bajarlo: sin mayorista, la caja se cobra
-- al precio de lista, que es lo que el vendedor venía escribiendo a mano. El
-- día que tengan un mayorista de verdad, se pone y manda.
--
-- Solo toca las filas donde mayorista = costo. Un mayorista de verdad (menor
-- que la lista pero mayor que el costo) no se toca.
--
-- Uso, desde tu terminal:
--   psql "$PROD_DB_URL" -f scripts/amawad-mayorista-era-el-costo.sql              (revisa)
--   psql "$PROD_DB_URL" -v apply=1 -f scripts/amawad-mayorista-era-el-costo.sql   (aplica)

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

CREATE TEMP TABLE afectados AS
SELECT p.id, p.name, p.base_price, p.cost_price, p.wholesale_price
FROM products p
JOIN tenants t ON t.id = p.tenant_id AND t.slug = 'amawad'
WHERE p.wholesale_price IS NOT NULL
  AND p.cost_price IS NOT NULL
  AND p.wholesale_price > 0
  AND p.wholesale_price = p.cost_price;

\echo ''
\echo '── Productos cuyo «mayorista» es en realidad el costo ──'
SELECT name AS producto,
       cost_price      AS costo,
       wholesale_price AS "mayorista (= costo)",
       base_price      AS "precio de lista"
FROM afectados
ORDER BY name
LIMIT 50;

SELECT count(*) AS "cuántos en total" FROM afectados;

\echo ''
\echo '── Sin precio de lista: estos quedarían SIN precio, revísalos aparte ──'
SELECT name AS producto, cost_price AS costo
FROM afectados
WHERE base_price IS NULL OR base_price <= 0
ORDER BY name;

\if :apply
  -- Los que no tienen precio de lista se dejan como están: quitarles el
  -- mayorista los dejaría en cero, que es peor que cobrarlos al costo.
  UPDATE products p
  SET wholesale_price = NULL
  FROM afectados a
  WHERE p.id = a.id
    AND a.base_price IS NOT NULL
    AND a.base_price > 0;
  \echo ''
  \echo 'APLICADO: esas cajas pasan a cobrarse al precio de lista.'
  COMMIT;
\else
  \echo ''
  \echo 'REVISIÓN (no se cambió nada). Para aplicar: -v apply=1'
  ROLLBACK;
\endif
