-- AMAWAD · el costo de VOMERO H en la compra OC-20260906-0001: 74 → 64.
--
-- Viene del mismo error: el dueño montó el costo y el precio en el campo
-- cambiado. El producto ya se corrigió; falta la compra, que es de donde sale
-- **lo que se le debe al proveedor** y el costo puesto en bodega de cada caja.
--
-- Se mueve todo lo que depende de ese número, o no se mueve nada:
--   · el renglón de la compra
--   · el subtotal y el total de la orden
--   · la cuenta por pagar
--   · el costo de las cajas que entraron por ese renglón
--
-- Aborta si el renglón ya no está en 74 —alguien lo arregló a mano— o si la
-- cuenta por pagar tiene abonos: bajar un total por debajo de lo ya pagado deja
-- al proveedor con un saldo a favor que nadie pactó.
--
-- Uso:
--   psql "$URL" -f scripts/amawad-vomero-costo-de-la-compra.sql            (revisa)
--   psql "$URL" -v apply=1 -f scripts/amawad-vomero-costo-de-la-compra.sql (aplica)

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

CREATE TEMP TABLE objetivo AS
SELECT bl.id                                     AS linea_id,
       po.id                                     AS orden_id,
       bl.unit_cost                              AS costo_actual,
       bl.boxes * bl.units_per_box               AS unidades,
       bl.boxes * bl.units_per_box * (bl.unit_cost - 64) AS diferencia,
       ap.id                                     AS cuenta_id,
       ap.paid_amount                            AS pagado
FROM purchase_box_lines bl
JOIN purchase_orders po ON po.id = bl.purchase_order_id
JOIN tenants t          ON t.id = po.tenant_id AND t.slug = 'amawad'
JOIN products p         ON p.id = bl.product_id
LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
WHERE po.order_number = 'OC-20260906-0001'
  AND p.name = 'AMA MAYLU 9/10/11/12 NIKE VOMERO H';

DO $$
DECLARE o RECORD;
BEGIN
  SELECT * INTO o FROM objetivo;
  IF o IS NULL THEN
    RAISE EXCEPTION 'No se encontró ese renglón en esa compra.';
  END IF;
  IF o.costo_actual <> 74 THEN
    RAISE EXCEPTION 'El renglón ya está en %, no en 74: revísalo a mano.',
      o.costo_actual;
  END IF;
  IF COALESCE(o.pagado, 0) > 0 THEN
    RAISE EXCEPTION
      'La cuenta por pagar tiene % abonado: bajar el total dejaría un saldo a favor sin pactar.',
      o.pagado;
  END IF;
END $$;

\echo ''
\echo '── Antes ──'
SELECT po.order_number, po.total AS "total de la compra",
       ap.amount AS "cuenta por pagar", o.costo_actual AS "costo del renglón",
       o.diferencia AS "lo que baja"
FROM objetivo o
JOIN purchase_orders po ON po.id = o.orden_id
LEFT JOIN accounts_payable ap ON ap.id = o.cuenta_id;

UPDATE purchase_box_lines bl SET unit_cost = 64
FROM objetivo o WHERE bl.id = o.linea_id;

UPDATE purchase_orders po SET
  subtotal = po.subtotal - o.diferencia,
  total    = po.total    - o.diferencia
FROM objetivo o WHERE po.id = o.orden_id;

UPDATE accounts_payable ap SET amount = ap.amount - o.diferencia
FROM objetivo o WHERE ap.id = o.cuenta_id;

-- El costo puesto en bodega de las cajas que entraron por ese renglón: es el
-- que la venta congela y con el que se valoriza el inventario.
UPDATE stock_units su SET cost = 64
FROM objetivo o WHERE su.purchase_box_line_id = o.linea_id;

\echo ''
\echo '── Después ──'
SELECT po.order_number, po.total AS "total de la compra",
       ap.amount AS "cuenta por pagar",
       (SELECT bl.unit_cost FROM purchase_box_lines bl JOIN objetivo o2 ON o2.linea_id = bl.id) AS "costo del renglón",
       (SELECT count(*) FROM stock_units su JOIN objetivo o3 ON o3.linea_id = su.purchase_box_line_id WHERE su.cost = 64) AS "cajas recosteadas"
FROM objetivo o
JOIN purchase_orders po ON po.id = o.orden_id
LEFT JOIN accounts_payable ap ON ap.id = o.cuenta_id;

\if :apply
  \echo 'APLICADO.'
  COMMIT;
\else
  \echo 'ENSAYO: no se cambió nada. Para aplicar: -v apply=1'
  ROLLBACK;
\endif
