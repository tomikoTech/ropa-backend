-- Sacar las dos cajas ALO 96/97 de la factura VTA-20260908-0005 y liberarlas.
--
-- Solo corre esto si **las dos cajas están físicamente en el local**: son
-- 26090800010040019 y 26090800010040026, la única referencia AMA MAYLU 96/97
-- ALO D que la tienda recibió (dos cajas, el 7 de septiembre).
--
-- Por qué existe: la factura 0005 se aplanó en 166 renglones de un par por un
-- error de la pantalla, y la reparación la devolvió a las siete cajas
-- originales —incluidas estas dos—. Si el cliente solo se llevó cinco, esta
-- reparación las dejó vendidas y el mostrador no puede volver a venderlas.
--
-- Qué hace: quita esos dos renglones, devuelve las cajas a la bodega con su
-- rastro, repone el agregado y baja la factura a las cinco cajas que sí
-- salieron ($9.096).
--
-- Uso, desde tu propia terminal:
--   psql "$PROD_DB_URL"              -f scripts/amawad-liberar-dos-cajas-alo.sql
--   psql "$PROD_DB_URL" -v aplicar=1 -f scripts/amawad-liberar-dos-cajas-alo.sql

\set ON_ERROR_STOP on
\set venta '50676346-bed5-4954-bde2-dc6eccaac8ae'
\set bodega '4abd3d79-4b8a-438e-a2a2-80d23921555b'
\set variante 'fb955b2c-9377-4694-a14a-468954eabd13'

BEGIN;

CREATE TEMP TABLE cajas ON COMMIT DROP AS
SELECT su.id AS stock_unit_id, su.barcode, su.variant_id, su.warehouse_id,
       su.quantity, su.tenant_id
FROM stock_units su
WHERE su.barcode IN ('26090800010040019','26090800010040026');

\echo ''
\echo '── Las dos cajas, como están ahora ──'
SELECT c.barcode, su.status, c.quantity, w.name AS bodega
FROM cajas c JOIN stock_units su ON su.id = c.stock_unit_id
JOIN warehouses w ON w.id = c.warehouse_id;

\echo ''
\echo '── La factura, antes y después ──'
SELECT count(*) AS renglones, SUM(si.quantity) AS pares, SUM(si.line_total) AS total
FROM sale_items si WHERE si.sale_id = :'venta';

SELECT count(*) AS renglones_despues, SUM(si.quantity) AS pares_despues,
       SUM(si.line_total) AS total_despues
FROM sale_items si
WHERE si.sale_id = :'venta'
  AND si.stock_unit_id NOT IN (SELECT stock_unit_id FROM cajas);

\echo ''
\echo '── El inventario de esa referencia ──'
SELECT st.quantity AS agregado_ahora, st.quantity + 48 AS agregado_despues
FROM stock st WHERE st.variant_id = :'variante' AND st.warehouse_id = :'bodega';

\if :{?aplicar}
  \echo ''
  \echo '── Aplicando ──'

  -- 1) Fuera los dos renglones.
  DELETE FROM sale_items
   WHERE sale_id = :'venta'
     AND stock_unit_id IN (SELECT stock_unit_id FROM cajas);

  -- 2) Las cajas vuelven a estar disponibles, con su rastro.
  UPDATE stock_units SET status='IN_STOCK', updated_at=now()
   WHERE id IN (SELECT stock_unit_id FROM cajas);

  INSERT INTO stock_unit_events
        (id, tenant_id, stock_unit_id, event_type, from_status, to_status,
         reference_type, reference_id, metadata, created_at)
  SELECT gen_random_uuid(), c.tenant_id, c.stock_unit_id, 'RETURNED', 'SOLD', 'IN_STOCK',
         'REPAIR', :'venta',
         jsonb_build_object('motivo',
           'Estas dos cajas no salieron con la factura 0005: siguen en el local'),
         now()
  FROM cajas c;

  -- 3) El agregado vuelve a contarlas.
  UPDATE stock st SET quantity = st.quantity + 48, updated_at = now()
   WHERE st.variant_id = :'variante' AND st.warehouse_id = :'bodega';

  INSERT INTO stock_movements
        (id, tenant_id, variant_id, warehouse_id, movement_type, reference_type,
         reference_id, quantity, unit_barcodes, notes, created_at)
  SELECT gen_random_uuid(), c.tenant_id, c.variant_id, c.warehouse_id, 'IN', 'SALE_EDIT',
         :'venta', 48,
         ARRAY(SELECT barcode FROM cajas),
         'Dos cajas ALO 96/97 que no salieron con la factura VTA-20260908-0005',
         now()
  FROM cajas c LIMIT 1;

  -- 4) La factura queda en las cinco cajas que sí salieron.
  UPDATE sales s
     SET subtotal = t.importe, total = t.importe, discount_amount = 0,
         updated_at = now()
    FROM (SELECT SUM(si.line_total) AS importe FROM sale_items si
           WHERE si.sale_id = :'venta') t
   WHERE s.id = :'venta';

  \echo 'Listo.'
\else
  \echo ''
  \echo 'Ensayo: no se cambió nada. Para aplicarlo, añade  -v aplicar=1'
\endif

COMMIT;
