-- Devolver la venta VTA-20260908-0005 a las siete cajas que de verdad salieron.
--
-- Qué le pasó: la pantalla de la venta, para poder señalar un par concreto,
-- aplanaba la factura entera en renglones de **una unidad**. Con siete cajas de
-- 24 eso las convirtió en 168 renglones sueltos; se excluyeron dos pares y
-- quedaron 166. Las cajas dejaron de existir como cajas, sus etiquetas se
-- quedaron sin marcar y el punto de venta empezó a decir «este código no está
-- disponible» con la caja en la mano.
--
-- El estado en que quedó no es físicamente posible: 95 pares de una referencia
-- son tres cajas y veintitrés sueltos, y esas cajas están cerradas.
--
-- Lo que sí es verdad y se conserva:
--   · el agregado — ALO 1, VOMERO 1, ADIZERO 48 — es exactamente lo que queda
--     después de vender las siete cajas. Solo hay que ajustar en 1 las dos
--     variantes de los pares excluidos.
--   · las siete cajas salieron de la tienda: se marcan como vendidas.
--
-- La factura vuelve a su total original: $13.080.
--
-- Uso, desde tu propia terminal:
--   psql "$PROD_DB_URL"              -f scripts/amawad-venta-0005-devolver-a-cajas.sql
--   psql "$PROD_DB_URL" -v aplicar=1 -f scripts/amawad-venta-0005-devolver-a-cajas.sql

\set ON_ERROR_STOP on
\set venta '50676346-bed5-4954-bde2-dc6eccaac8ae'

BEGIN;

-- Las siete cajas, con su variante y su precio de venta.
CREATE TEMP TABLE cajas ON COMMIT DROP AS
SELECT su.id AS stock_unit_id, su.barcode, su.variant_id, su.warehouse_id,
       su.quantity, su.tenant_id,
       CASE su.variant_id
         WHEN '7f6c35db-329d-4564-a6a7-5c00f3df2bbd' THEN 74.00  -- VOMERO
         ELSE 83.00                                              -- ALO y ADIZERO
       END AS unit_price,
       CASE su.variant_id
         WHEN '7f6c35db-329d-4564-a6a7-5c00f3df2bbd' THEN 64.00
         ELSE 74.00
       END AS unit_cost
FROM stock_units su
WHERE su.barcode IN (
  '26090800010040019','26090800010040026',                     -- ALO      (2)
  '26090800010090014','26090800010090021',                     -- VOMERO   (4)
  '26090800010090038','26090800010090045',
  '26090800010280033'                                          -- ADIZERO  (1)
);

\echo ''
\echo '── Cómo queda la factura ──'
SELECT p.name AS producto, count(*) AS cajas, SUM(c.quantity) AS unidades,
       MIN(c.unit_price) AS precio, SUM(c.quantity * c.unit_price) AS importe
FROM cajas c JOIN product_variants v ON v.id=c.variant_id JOIN products p ON p.id=v.product_id
GROUP BY p.name ORDER BY p.name;

SELECT SUM(c.quantity * c.unit_price) AS "TOTAL de la factura" FROM cajas c;

\echo ''
\echo '── Inventario: cómo queda cada punto ──'
SELECT p.name AS producto, w.name AS bodega,
       st.quantity AS agregado_ahora,
       COALESCE((SELECT SUM(u.quantity) FROM stock_units u
                  WHERE u.variant_id = st.variant_id
                    AND u.warehouse_id = st.warehouse_id
                    AND u.status = 'IN_STOCK'), 0) AS etiquetas_ahora,
       CASE WHEN st.quantity = 1 THEN 0 ELSE st.quantity END AS agregado_despues,
       COALESCE((SELECT SUM(u.quantity) FROM stock_units u
                  WHERE u.variant_id = st.variant_id
                    AND u.warehouse_id = st.warehouse_id
                    AND u.status = 'IN_STOCK'
                    AND u.id NOT IN (SELECT stock_unit_id FROM cajas)), 0)
         AS etiquetas_despues
FROM stock st
JOIN product_variants v ON v.id = st.variant_id
JOIN products p ON p.id = v.product_id
JOIN warehouses w ON w.id = st.warehouse_id
WHERE st.variant_id IN (SELECT DISTINCT variant_id FROM cajas)
ORDER BY p.name, w.name;

\if :{?aplicar}
  \echo ''
  \echo '── Aplicando ──'

  -- 1) Fuera los 166 renglones de un par.
  DELETE FROM sale_items WHERE sale_id = :'venta';

  -- 2) Las siete cajas, una por renglón, con su bulto.
  INSERT INTO sale_items
        (id, tenant_id, sale_id, variant_id,
         product_name, variant_sku, variant_size, variant_color,
         quantity, unit_price, discount_percent, tax_rate, tax_amount,
         line_total, is_leftover, commission_amount, unit_cost,
         stock_unit_id, unit_kind, created_at)
  SELECT gen_random_uuid(), c.tenant_id, :'venta', c.variant_id,
         p.name,
         v.sku,
         COALESCE((SELECT sz.name FROM sizes sz WHERE sz.id = v.size_id), ''),
         COALESCE((SELECT co.name FROM colors co WHERE co.id = v.color_id), ''),
         c.quantity, c.unit_price, 0, 0, 0,
         c.quantity * c.unit_price, false, 0, c.unit_cost,
         c.stock_unit_id, 'BOX', now()
  FROM cajas c
  JOIN product_variants v ON v.id = c.variant_id
  JOIN products p ON p.id = v.product_id;

  -- 3) Las cajas salieron de la tienda.
  UPDATE stock_units SET status='SOLD', updated_at=now()
   WHERE id IN (SELECT stock_unit_id FROM cajas) AND status <> 'SOLD';

  INSERT INTO stock_unit_events
        (id, tenant_id, stock_unit_id, event_type, from_status, to_status,
         reference_type, reference_id, metadata, created_at)
  SELECT gen_random_uuid(), c.tenant_id, c.stock_unit_id, 'SOLD', 'IN_STOCK', 'SOLD',
         'REPAIR', :'venta',
         jsonb_build_object('motivo',
           'La factura se había aplanado en renglones de un par y la caja quedó sin marcar'),
         now()
  FROM cajas c;

  -- 4) El agregado: los dos pares que se habían excluido vuelven a venderse.
  UPDATE stock st SET quantity = 0, updated_at = now()
   WHERE st.variant_id IN ('7f6c35db-329d-4564-a6a7-5c00f3df2bbd',
                           'fb955b2c-9377-4694-a14a-468954eabd13')
     AND st.warehouse_id = '4abd3d79-4b8a-438e-a2a2-80d23921555b'
     AND st.quantity = 1;

  -- 5) Los totales de la factura.
  UPDATE sales s
     SET subtotal = t.importe, total = t.importe, discount_amount = 0,
         updated_at = now()
    FROM (SELECT SUM(quantity * unit_price) AS importe FROM cajas) t
   WHERE s.id = :'venta';

  \echo 'Listo.'
\else
  \echo ''
  \echo 'Ensayo: no se cambió nada. Para aplicarlo, añade  -v aplicar=1'
\endif

COMMIT;
