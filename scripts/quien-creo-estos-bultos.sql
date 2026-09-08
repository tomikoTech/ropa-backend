-- ¿Quién creó estos bultos, cuándo y con qué documento?
--
-- Solo LEE. Contesta la pregunta que se hace mirando la pantalla de Cajas y
-- viendo mercancía que uno no recuerda haber ingresado: «¿esto de dónde salió?».
--
-- Cada bulto deja tres rastros y acá se cruzan los tres:
--   · `stock_unit_events`  — quién lo creó y por qué documento (RECEIVED…)
--   · `stock_movements`    — el movimiento de inventario, con su usuario
--   · el código de barras  — lleva la fecha y el pedido dentro
--
-- Uso, desde tu propia terminal:
--   psql "$PROD_DB_URL" -v tenant="'amawad'" -f scripts/quien-creo-estos-bultos.sql
--
-- Para seguir UN código concreto, añade  -v codigo="'26090800010040019'"

\set ON_ERROR_STOP on
\if :{?codigo}
\else
  \set codigo ''
\endif

\echo ''
\echo '── Los bultos y quién los creó ──'

SELECT
  su.barcode                                   AS codigo,
  su.created_at                                AS "creado el",
  COALESCE(u.first_name || ' ' || u.last_name,
           'sin usuario (script o importación)') AS "quién lo creó",
  ev.event_type                                AS evento,
  ev.reference_type                            AS "por qué documento",
  po.order_number                              AS "orden de compra",
  p.name                                       AS producto,
  su.kind                                      AS tipo,
  su.quantity                                  AS unidades,
  su.status                                    AS estado,
  w.name                                       AS bodega
FROM stock_units su
JOIN tenants t              ON t.id = su.tenant_id AND t.slug = :tenant
LEFT JOIN products p        ON p.id = su.product_id
LEFT JOIN warehouses w      ON w.id = su.warehouse_id
LEFT JOIN purchase_box_lines bl ON bl.id = su.purchase_box_line_id
LEFT JOIN purchase_orders po    ON po.id = bl.purchase_order_id
-- El primer evento del bulto es su nacimiento.
LEFT JOIN LATERAL (
  SELECT e.* FROM stock_unit_events e
   WHERE e.stock_unit_id = su.id
   ORDER BY e.created_at ASC
   LIMIT 1
) ev ON true
LEFT JOIN users u           ON u.id = ev.user_id
WHERE (:'codigo' = '' OR su.barcode = :'codigo')
ORDER BY su.created_at DESC
LIMIT 60;

\echo ''
\echo '── El movimiento de inventario que los metió a la bodega ──'

SELECT
  sm.created_at                                AS cuando,
  COALESCE(u.first_name || ' ' || u.last_name,
           'sin usuario')                      AS quien,
  sm.movement_type                             AS movimiento,
  sm.reference_type                            AS documento,
  sm.quantity                                  AS cantidad,
  w.name                                       AS bodega,
  sm.notes                                     AS nota,
  sm.unit_barcodes                             AS "códigos que movió"
FROM stock_movements sm
JOIN tenants t         ON t.id = sm.tenant_id AND t.slug = :tenant
LEFT JOIN users u      ON u.id = sm.created_by
LEFT JOIN warehouses w ON w.id = sm.warehouse_id
WHERE sm.unit_barcodes IS NOT NULL
  AND (
    :'codigo' = ''
    OR :'codigo' = ANY(sm.unit_barcodes)
  )
ORDER BY sm.created_at DESC
LIMIT 40;

\echo ''
\echo '── Toda la historia de cada bulto (abrir caja, vender, dar de baja…) ──'

SELECT
  su.barcode                                   AS codigo,
  ev.created_at                                AS cuando,
  ev.event_type                                AS evento,
  COALESCE(ev.from_status, '—') || ' → ' || COALESCE(ev.to_status, '—') AS estado,
  COALESCE(u.first_name || ' ' || u.last_name, 'sin usuario') AS quien,
  ev.reference_type                            AS documento
FROM stock_unit_events ev
JOIN stock_units su ON su.id = ev.stock_unit_id
JOIN tenants t      ON t.id = su.tenant_id AND t.slug = :tenant
LEFT JOIN users u   ON u.id = ev.user_id
WHERE (:'codigo' = '' OR su.barcode = :'codigo')
ORDER BY ev.created_at DESC
LIMIT 80;
