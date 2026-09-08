-- AMAWAD · VOMERO H: el costo y el precio de venta quedaron intercambiados.
--
-- Lo dijo el dueño: «el precio de compra era 64 y el de venta 74; yo lo monté
-- mal, el de venta a 64 y la compra a 74». Los datos lo confirman:
--
--     costo 74 · venta 83 · mayorista 64
--
-- El 64 que quedó en «mayorista» es en realidad el **costo**, y el 74 que quedó
-- en «costo» es el **precio de venta**. Se ordenan los tres:
--
--     costo 64 · venta 74 · mayorista (vacío)
--
-- El mayorista se borra en vez de dejarlo en 64: quedaría igual al costo, que
-- es exactamente el error que hace que una caja se cobre al costo (ya corregido
-- en otros 22 productos de esta tienda).
--
-- Y el costo **congelado** en las líneas ya vendidas: era 74, así que esa venta
-- mostraba utilidad cero. Con 64 dice la verdad —$10 por par—. La foto del
-- costo se corrige solo aquí, donde se sabe que estaba mal.
--
-- Uso:
--   psql "$URL" -f scripts/amawad-vomero-precios-invertidos.sql            (revisa)
--   psql "$URL" -v apply=1 -f scripts/amawad-vomero-precios-invertidos.sql (aplica)

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

CREATE TEMP TABLE objetivo AS
SELECT p.id, p.name, p.base_price, p.cost_price, p.wholesale_price
FROM products p
JOIN tenants t ON t.id = p.tenant_id AND t.slug = 'amawad'
WHERE p.name = 'AMA MAYLU 9/10/11/12 NIKE VOMERO H';

DO $$
DECLARE o RECORD;
BEGIN
  SELECT * INTO o FROM objetivo;
  IF o IS NULL THEN
    RAISE EXCEPTION 'No se encontró el producto.';
  END IF;
  -- Solo se toca si está tal como se describió: si alguien ya lo arregló a
  -- mano, este script no debe pasarle por encima.
  IF o.cost_price <> 74 OR o.wholesale_price IS DISTINCT FROM 64 THEN
    RAISE EXCEPTION
      'El producto ya no está como se describió (costo %, mayorista %): revísalo a mano.',
      o.cost_price, o.wholesale_price;
  END IF;
END $$;

\echo ''
\echo '── Antes ──'
SELECT name AS producto, cost_price AS costo, base_price AS venta,
       wholesale_price AS mayorista FROM objetivo;

UPDATE products p SET
  cost_price      = 64,
  base_price      = 74,
  wholesale_price = NULL,
  updated_at      = now()
FROM objetivo o WHERE p.id = o.id;

-- El costo congelado de lo ya vendido: la utilidad de esas ventas estaba en
-- cero porque el costo copiado era el precio.
UPDATE sale_items si SET unit_cost = 64
FROM objetivo o
JOIN product_variants pv ON pv.product_id = o.id
WHERE si.variant_id = pv.id AND si.unit_cost = 74;

\echo ''
\echo '── Después ──'
SELECT p.name AS producto, p.cost_price AS costo, p.base_price AS venta,
       p.wholesale_price AS mayorista
FROM products p JOIN objetivo o ON o.id = p.id;

SELECT count(*) AS "líneas de venta recosteadas", sum(si.quantity) AS unidades,
       sum((si.unit_price - si.unit_cost) * si.quantity) AS "utilidad real"
FROM sale_items si
JOIN objetivo o ON true
JOIN product_variants pv ON pv.product_id = o.id AND pv.id = si.variant_id
WHERE si.unit_cost = 64;

\if :apply
  \echo 'APLICADO.'
  COMMIT;
\else
  \echo 'ENSAYO: no se cambió nada. Para aplicar: -v apply=1'
  ROLLBACK;
\endif
