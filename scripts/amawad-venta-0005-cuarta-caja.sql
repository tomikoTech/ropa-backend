-- AMAWAD · VTA-20260908-0005: la cuarta caja que se vendió y no quedó facturada.
--
-- Qué pasó. Se vendieron cuatro cajas de AMA MAYLU 9/10/11/12 NIKE VOMERO H.
-- El sistema marcó las cuatro como vendidas pero solo guardó **tres líneas**:
-- el emparejamiento de la edición era un `Map` por variante y cuatro cajas de
-- la misma referencia entraban como una sola. (Ya está arreglado; esto limpia
-- lo que quedó.)
--
-- Consecuencias, las dos que importan:
--   · La factura cobró 72 pares y salieron 96 → faltan $1.776 por cobrar.
--   · El agregado descontó 72 y salieron 96 → sobran 24 en la bodega.
--
-- Qué hace. Agrega la línea que falta —clonando una hermana, así hereda IVA,
-- costo y descuento tal como se registraron— la ata a la caja `…90014`, ajusta
-- los totales de la venta y baja el agregado a cero con su movimiento.
--
-- Aborta si algo no está como se espera: la venta tiene que existir, la caja
-- tiene que estar vendida y sin línea, y el agregado tiene que ser 24.
--
-- Uso:
--   psql "$URL" -f scripts/amawad-venta-0005-cuarta-caja.sql            (revisa)
--   psql "$URL" -v apply=1 -f scripts/amawad-venta-0005-cuarta-caja.sql (aplica)

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

CREATE TEMP TABLE contexto AS
SELECT
  s.id                       AS sale_id,
  s.total                    AS total_actual,
  su.id                      AS unit_id,
  su.quantity                AS unidades,
  su.variant_id,
  su.warehouse_id,
  (SELECT si.id FROM sale_items si
    WHERE si.sale_id = s.id AND si.variant_id = su.variant_id
    ORDER BY si.created_at LIMIT 1) AS linea_hermana,
  (SELECT st.quantity FROM stock st
    WHERE st.variant_id = su.variant_id
      AND st.warehouse_id = su.warehouse_id
      AND st.tenant_id = s.tenant_id)          AS agregado,
  (SELECT count(*) FROM sale_items si2 WHERE si2.stock_unit_id = su.id) AS ya_facturada
FROM sales s
JOIN tenants t     ON t.id = s.tenant_id AND t.slug = 'amawad'
JOIN stock_units su ON su.tenant_id = s.tenant_id
                   AND su.barcode = '26090800010090014'
WHERE s.sale_number = 'VTA-20260908-0005';

\echo ''
\echo '── Lo que se va a tocar ──'
SELECT * FROM contexto;

-- Guardas. Si cualquiera falla, no se toca nada.
DO $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM contexto;
  IF c IS NULL THEN
    RAISE EXCEPTION 'No se encontró la venta o la caja: nada que hacer.';
  END IF;
  IF c.ya_facturada > 0 THEN
    RAISE EXCEPTION 'Esa caja YA está en una línea de venta: no hay que agregarla.';
  END IF;
  IF c.linea_hermana IS NULL THEN
    RAISE EXCEPTION 'La venta no tiene otra línea de esa referencia de la que copiar.';
  END IF;
  IF c.agregado <> c.unidades THEN
    RAISE EXCEPTION
      'El agregado es % y la caja trae %: el descuadre no es el que se creía.',
      c.agregado, c.unidades;
  END IF;
END $$;

-- 1. La línea que falta, clonada de su hermana para heredarlo todo.
CREATE TEMP TABLE nueva_linea AS
SELECT si.* FROM sale_items si
JOIN contexto c ON c.linea_hermana = si.id;

-- `sale_items` no lleva `updated_at`: solo se cambian identidad y vínculo.
UPDATE nueva_linea SET
  id            = gen_random_uuid(),
  stock_unit_id = (SELECT unit_id FROM contexto),
  created_at    = now();

INSERT INTO sale_items SELECT * FROM nueva_linea;

-- 2. Los totales de la venta suben por lo que de verdad se vendió.
UPDATE sales s SET
  subtotal = s.subtotal + (SELECT line_total FROM nueva_linea),
  total    = s.total    + (SELECT line_total FROM nueva_linea),
  updated_at = now()
FROM contexto c
WHERE s.id = c.sale_id;

-- 3. El inventario: salieron 24 que nadie descontó.
UPDATE stock st SET quantity = 0, updated_at = now()  -- ledger-exento: repara lo que la venta no descontó
FROM contexto c
WHERE st.variant_id = c.variant_id AND st.warehouse_id = c.warehouse_id;

-- 4. Con su rastro, para que el historial cuente la verdad.
INSERT INTO stock_movements
  (id, variant_id, warehouse_id, movement_type, quantity,
   reference_type, reference_id, notes, unit_barcodes, tenant_id, created_at)
SELECT gen_random_uuid(), c.variant_id, c.warehouse_id, 'OUT', -c.unidades,
       'SALE', c.sale_id::text,
       'Venta VTA-20260908-0005 · la cuarta caja salió y no se había descontado',
       ARRAY['26090800010090014'],
       (SELECT id FROM tenants WHERE slug = 'amawad'), now()
FROM contexto c;

\echo ''
\echo '── Cómo queda ──'
SELECT s.sale_number, s.total,
       (SELECT count(*) FROM sale_items si WHERE si.sale_id = s.id)  AS renglones,
       (SELECT sum(si.quantity) FROM sale_items si WHERE si.sale_id = s.id) AS unidades
FROM sales s JOIN contexto c ON c.sale_id = s.id;

SELECT st.quantity AS "agregado de VOMERO"
FROM stock st JOIN contexto c
  ON c.variant_id = st.variant_id AND c.warehouse_id = st.warehouse_id;

\if :apply
  \echo 'APLICADO.'
  COMMIT;
\else
  \echo 'ENSAYO: no se cambió nada. Para aplicar: -v apply=1'
  ROLLBACK;
\endif
