-- ¿De dónde salió el precio con el que se vendió?
--
-- Solo LEE. Contesta la pregunta que se hace mirando una factura rara: «¿por
-- qué me cobró $74?». El POS resuelve el precio de un bulto en este orden:
--
--   1. wholesale_price del producto  → solo si es CAJA
--   2. sale_price del RENGLÓN DE LA COMPRA por el que entró ese bulto
--   3. base_price del producto
--
-- El (2) es el que sorprende: es un precio escrito en la compra, no en la ficha
-- del producto. Si alguien puso ahí el costo, el POS vende al costo y en la
-- pantalla no se veía por qué. La consulta muestra las tres cifras juntas, así
-- que la que coincide con lo cobrado es la culpable.
--
-- Uso (desde tu propia terminal, no desde un agente):
--   psql "$PROD_DB_URL" -v tenant="'amawad'" -f scripts/por-que-ese-precio.sql

\set ON_ERROR_STOP on

WITH t AS (
  SELECT id FROM tenants WHERE slug = :tenant
)
SELECT
  s.sale_number                       AS factura,
  s.created_at                        AS fecha,
  si.product_name                     AS producto,
  si.unit_kind                        AS tipo,
  si.quantity                         AS cantidad,
  si.unit_price                       AS "cobrado (unidad)",
  si.unit_cost                        AS "costo congelado",
  p.base_price                        AS "3. precio de lista",
  p.wholesale_price                   AS "1. mayorista",
  bl.sale_price                       AS "2. precio en la compra",
  bl.unit_cost                        AS "costo en la compra",
  po.order_number                     AS "de qué compra",
  CASE
    WHEN si.unit_kind = 'BOX' AND COALESCE(p.wholesale_price, 0) > 0
      THEN 'mayorista del producto'
    WHEN COALESCE(bl.sale_price, 0) > 0
      THEN 'precio escrito en la compra'
    ELSE 'precio de lista del producto'
  END                                 AS "de dónde salió"
FROM sale_items si
JOIN sales s          ON s.id = si.sale_id
JOIN t                ON t.id = s.tenant_id
LEFT JOIN products p  ON p.id = (
  SELECT v.product_id FROM product_variants v WHERE v.id = si.variant_id
)
LEFT JOIN stock_units su      ON su.id = si.stock_unit_id
LEFT JOIN purchase_box_lines bl ON bl.id = su.purchase_box_line_id
LEFT JOIN purchase_orders po  ON po.id = bl.purchase_order_id
ORDER BY s.created_at DESC
LIMIT 40;
