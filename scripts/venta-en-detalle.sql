-- Todo lo que hay detrás de una venta. Solo LEE.
--
-- Para cuando la pantalla y la memoria no coinciden: «vendió 96 pero refleja
-- 72». Muestra línea por línea qué quedó guardado, con qué códigos, y lo
-- contrasta con los bultos que esos códigos representan.
--
-- Uso:
--   psql "$PROD_DB_URL" -v tenant="'amawad'" -v venta="'VTA-20260908-0005'" \
--     -f scripts/venta-en-detalle.sql

\set ON_ERROR_STOP on

\echo ''
\echo '── La venta ──'

SELECT s.sale_number   AS venta,
       s.invoice_number AS factura,
       s.created_at    AS fecha,
       s.status        AS estado,
       s.subtotal, s.discount_amount AS descuento, s.tax_amount AS iva, s.total,
       w.name          AS bodega,
       u.first_name || ' ' || u.last_name AS vendedor
FROM sales s
JOIN tenants t        ON t.id = s.tenant_id AND t.slug = :tenant
LEFT JOIN warehouses w ON w.id = s.warehouse_id
LEFT JOIN users u      ON u.id = s.user_id
WHERE s.sale_number = :venta OR s.invoice_number = :venta;

\echo ''
\echo '── Sus líneas, una por una ──'

SELECT si.product_name  AS producto,
       si.unit_kind     AS tipo,
       si.quantity      AS cantidad,
       si.unit_price    AS "precio unitario",
       si.line_total    AS "total línea",
       si.unit_cost     AS "costo unitario",
       si.stock_unit_id IS NOT NULL AS "¿con bulto?",
       su.barcode       AS "código del bulto",
       su.quantity      AS "lo que trae ese bulto",
       su.status        AS "estado del bulto"
FROM sale_items si
JOIN sales s     ON s.id = si.sale_id
JOIN tenants t   ON t.id = s.tenant_id AND t.slug = :tenant
LEFT JOIN stock_units su ON su.id = si.stock_unit_id
WHERE s.sale_number = :venta OR s.invoice_number = :venta
ORDER BY si.created_at, si.id;

\echo ''
\echo '── La cuenta: lo que suman las líneas contra el total guardado ──'

SELECT COUNT(*)                          AS "renglones",
       SUM(si.quantity)                  AS "unidades sumadas",
       SUM(si.line_total)                AS "suma de las líneas",
       MAX(s.total)                      AS "total guardado",
       COUNT(*) FILTER (WHERE si.stock_unit_id IS NULL) AS "renglones SIN bulto"
FROM sale_items si
JOIN sales s   ON s.id = si.sale_id
JOIN tenants t ON t.id = s.tenant_id AND t.slug = :tenant
WHERE s.sale_number = :venta OR s.invoice_number = :venta;

\echo ''
\echo '── Qué se movió del inventario por esta venta ──'

SELECT sm.created_at   AS cuando,
       sm.movement_type AS movimiento,
       sm.quantity     AS cantidad,
       w.name          AS bodega,
       sm.unit_barcodes AS "códigos",
       sm.notes        AS nota
FROM stock_movements sm
JOIN sales s   ON s.id::text = sm.reference_id
JOIN tenants t ON t.id = sm.tenant_id AND t.slug = :tenant
LEFT JOIN warehouses w ON w.id = sm.warehouse_id
WHERE s.sale_number = :venta OR s.invoice_number = :venta
ORDER BY sm.created_at;
