-- Devolver a la bodega los bultos que quedaron marcados como vendidos
-- después de que su venta se anulara o se editara.
--
-- Por qué existe: `unit_tracking` se podía apagar entre la venta y su
-- anulación, y la reversa preguntaba por el interruptor antes de liberar los
-- bultos. Oía «este producto no lleva bultos» y no tocaba los que ya estaban
-- fuera: el agregado volvía a la bodega y las cajas se quedaban vendidas para
-- siempre. Sus códigos impresos no se podían volver a escanear ni vender.
--
-- El código ya no lo hace (ver `stock-ledger.service.ts`: una reversa siempre
-- mira si ese mismo documento sacó bultos). Esto repara lo que quedó atrás.
--
-- Solo devuelve lo que **cuadra**: si el agregado de esa variante en esa bodega
-- no alcanza para respaldar la caja que vuelve, se deja como está y se reporta.
-- Devolver una caja que el agregado no tiene crearía el descuadre contrario.
--
-- Uso, desde tu propia terminal:
--   psql "$PROD_DB_URL"              -f scripts/liberar-bultos-de-ventas-anuladas.sql   (ensayo)
--   psql "$PROD_DB_URL" -v aplicar=1 -f scripts/liberar-bultos-de-ventas-anuladas.sql   (de verdad)

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE huerfanos ON COMMIT DROP AS
SELECT su.id, su.barcode, su.quantity, su.variant_id, su.warehouse_id,
       su.tenant_id, t.slug AS tienda, p.name AS producto
FROM stock_units su
JOIN tenants t  ON t.id = su.tenant_id
LEFT JOIN products p ON p.id = su.product_id
WHERE su.status = 'SOLD'
  -- Ninguna venta viva se lo lleva por su línea…
  AND NOT EXISTS (
    SELECT 1 FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE si.stock_unit_id = su.id AND s.status <> 'CANCELLED')
  -- …ni por los códigos que anotó el movimiento.
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements sm JOIN sales s2 ON s2.id::text = sm.reference_id::text
     WHERE su.barcode = ANY(sm.unit_barcodes) AND s2.status <> 'CANCELLED');

-- ¿Cabe en el agregado? Se compara la variante+bodega completa, no caja a caja.
CREATE TEMP TABLE veredicto ON COMMIT DROP AS
SELECT h.*,
       st.quantity AS agregado,
       COALESCE((SELECT SUM(u2.quantity) FROM stock_units u2
                  WHERE u2.variant_id = h.variant_id
                    AND u2.warehouse_id = h.warehouse_id
                    AND u2.status = 'IN_STOCK'), 0) AS ya_disponibles,
       (SELECT SUM(h2.quantity) FROM huerfanos h2
         WHERE h2.variant_id = h.variant_id AND h2.warehouse_id = h.warehouse_id) AS vuelven
FROM huerfanos h
LEFT JOIN stock st ON st.variant_id = h.variant_id AND st.warehouse_id = h.warehouse_id;

\echo ''
\echo '── Bultos que volverían a estar disponibles ──'
SELECT tienda, producto, barcode, quantity AS unidades,
       agregado, ya_disponibles, vuelven,
       CASE WHEN ya_disponibles + vuelven <= COALESCE(agregado, 0)
            THEN 'vuelve' ELSE 'NO: el agregado no alcanza' END AS decision
FROM veredicto ORDER BY tienda, producto, barcode;

\echo ''
\echo '── Resumen ──'
SELECT tienda,
       count(*) FILTER (WHERE ya_disponibles + vuelven <= COALESCE(agregado,0)) AS vuelven,
       count(*) FILTER (WHERE ya_disponibles + vuelven >  COALESCE(agregado,0)) AS se_quedan,
       SUM(quantity) FILTER (WHERE ya_disponibles + vuelven <= COALESCE(agregado,0)) AS unidades
FROM veredicto GROUP BY tienda ORDER BY tienda;

\if :{?aplicar}
  \echo ''
  \echo '── Aplicando ──'

  UPDATE stock_units su
     SET status = 'IN_STOCK', updated_at = now()
    FROM veredicto v
   WHERE su.id = v.id
     AND v.ya_disponibles + v.vuelven <= COALESCE(v.agregado, 0);

  -- El rastro de por qué volvieron, en la historia del bulto.
  INSERT INTO stock_unit_events
        (id, tenant_id, stock_unit_id, event_type, from_status, to_status,
         reference_type, metadata, created_at)
  SELECT gen_random_uuid(), v.tenant_id, v.id, 'RETURNED', 'SOLD', 'IN_STOCK',
         'REPAIR',
         jsonb_build_object(
           'motivo',
           'Su venta se anuló y el bulto se quedó marcado como vendido: el ' ||
           'rastreo por unidades del producto se apagó entre la venta y la ' ||
           'anulación, y la reversa no lo liberó.'),
         now()
    FROM veredicto v
   WHERE v.ya_disponibles + v.vuelven <= COALESCE(v.agregado, 0);

  \echo 'Listo.'
\else
  \echo ''
  \echo 'Ensayo: no se cambió nada. Para aplicarlo, añade  -v aplicar=1'
\endif

COMMIT;
