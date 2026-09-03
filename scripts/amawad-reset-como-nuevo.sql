-- ============================================================================
-- amawad · RESET "como nuevo": borrar TODO el negocio, dejar solo TERCEROS
--         (+ login, config, bodegas, clientes, proveedores, catálogos de ref.)
-- ============================================================================
--
-- CONSERVA (no se tocan):
--   - tenants, users, refresh_tokens, access_roles, role_permissions,
--     user_warehouses, store_settings, push_subscriptions   (login/config)
--   - warehouses, stands, shelves, banks                     (infra)
--   - clients, suppliers                                     (elegido)
--   - brands, colors, sizes, categories,
--     size_curves, size_curve_types, size_curve_items,
--     expense_categories                                     (catálogos ref.)
--   - consignments, third_party_products                     (TERCEROS)
--
-- BORRA (todo a cero, solo amawad):
--   productos+variantes+esencias, todo el stock (agregado/unidades/eventos/
--   movimientos/traslados), conteos, ventas+ítems+pagos, devoluciones+notas,
--   compras+ítems+cajas, cartera (CxC/CxP) y sus pagos, cotizaciones,
--   producción, reservas, promociones, bonos, gastos, caja menor, cierres,
--   ingresos, ecommerce (órdenes/ítems/clientes), calle (vendedores/despachos),
--   promotoras, pedidos internos, notificaciones, audit_logs, bot.
--
-- Uso:
--   Dry-run (no cambia nada, muestra antes/después y ROLLBACK):
--     psql "$PROD_DB_URL" -f amawad-reset-como-nuevo.sql
--   Aplicar (COMMIT):
--     psql "$PROD_DB_URL" -v apply=1 -f amawad-reset-como-nuevo.sql
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

SELECT id AS tid FROM tenants WHERE slug = 'amawad' \gset
\echo '=== tenant amawad ===' :tid

\echo '=== ANTES · lo que se BORRA ==='
SELECT
  (SELECT count(*) FROM products         WHERE tenant_id=:'tid') AS products,
  (SELECT count(*) FROM product_variants WHERE tenant_id=:'tid') AS variants,
  (SELECT count(*) FROM stock            WHERE tenant_id=:'tid') AS stock,
  (SELECT count(*) FROM stock_units      WHERE tenant_id=:'tid') AS units,
  (SELECT count(*) FROM sales            WHERE tenant_id=:'tid') AS sales,
  (SELECT count(*) FROM purchase_orders  WHERE tenant_id=:'tid') AS compras,
  (SELECT count(*) FROM returns          WHERE tenant_id=:'tid') AS devol,
  (SELECT count(*) FROM accounts_receivable WHERE tenant_id=:'tid') AS cxc,
  (SELECT count(*) FROM accounts_payable WHERE tenant_id=:'tid') AS cxp,
  (SELECT count(*) FROM expenses         WHERE tenant_id=:'tid') AS gastos,
  (SELECT count(*) FROM inventory_counts WHERE tenant_id=:'tid') AS conteos;

\echo '=== ANTES · lo que se CONSERVA ==='
SELECT
  (SELECT count(*) FROM warehouses  WHERE tenant_id=:'tid') AS bodegas,
  (SELECT count(*) FROM clients     WHERE tenant_id=:'tid') AS clientes,
  (SELECT count(*) FROM suppliers   WHERE tenant_id=:'tid') AS proveedores,
  (SELECT count(*) FROM brands      WHERE tenant_id=:'tid') AS marcas,
  (SELECT count(*) FROM colors      WHERE tenant_id=:'tid') AS colores,
  (SELECT count(*) FROM sizes       WHERE tenant_id=:'tid') AS tallas,
  (SELECT count(*) FROM categories  WHERE tenant_id=:'tid') AS categorias,
  (SELECT count(*) FROM users       WHERE tenant_id=:'tid') AS usuarios,
  (SELECT count(*) FROM consignments WHERE tenant_id=:'tid') AS terceros,
  (SELECT count(*) FROM third_party_products WHERE tenant_id=:'tid') AS libreta;

-- ---- Nivel 1: detalle / pagos (hijos) -------------------------------------
DELETE FROM accounts_payable_payments WHERE accounts_payable_id IN (SELECT id FROM accounts_payable WHERE tenant_id=:'tid');
DELETE FROM accounts_receivable_payments   WHERE tenant_id=:'tid';
DELETE FROM credit_notes                   WHERE tenant_id=:'tid';
DELETE FROM return_items                   WHERE tenant_id=:'tid';
DELETE FROM payments                       WHERE tenant_id=:'tid';
DELETE FROM sale_items                     WHERE tenant_id=:'tid';
DELETE FROM purchase_box_lines             WHERE tenant_id=:'tid';
DELETE FROM purchase_order_items           WHERE tenant_id=:'tid';
DELETE FROM quotation_items                WHERE tenant_id=:'tid';
DELETE FROM production_items               WHERE tenant_id=:'tid';
DELETE FROM ecommerce_order_items          WHERE tenant_id=:'tid';
DELETE FROM street_dispatch_items          WHERE tenant_id=:'tid';
DELETE FROM internal_request_shipments     WHERE tenant_id=:'tid';
DELETE FROM internal_request_units         WHERE tenant_id=:'tid';
DELETE FROM internal_request_items         WHERE tenant_id=:'tid';
DELETE FROM inventory_count_scans          WHERE tenant_id=:'tid';
DELETE FROM inventory_count_expected_units WHERE tenant_id=:'tid';
DELETE FROM inventory_count_lines          WHERE tenant_id=:'tid';
DELETE FROM stock_unit_events              WHERE tenant_id=:'tid';
DELETE FROM stock_unit_contents            WHERE tenant_id=:'tid';
DELETE FROM product_essences               WHERE tenant_id=:'tid';
DELETE FROM bot_message WHERE conversation_id IN (SELECT id FROM bot_conversation WHERE tenant_id=:'tid');

-- ---- Nivel 2: parents transaccionales -------------------------------------
DELETE FROM accounts_receivable            WHERE tenant_id=:'tid';
DELETE FROM accounts_payable               WHERE tenant_id=:'tid';
DELETE FROM returns                        WHERE tenant_id=:'tid';
DELETE FROM sales                          WHERE tenant_id=:'tid';
DELETE FROM purchase_orders                WHERE tenant_id=:'tid';
DELETE FROM quotations                     WHERE tenant_id=:'tid';
DELETE FROM productions                    WHERE tenant_id=:'tid';
DELETE FROM ecommerce_orders               WHERE tenant_id=:'tid';
DELETE FROM ecommerce_customers            WHERE tenant_id=:'tid';
DELETE FROM street_dispatches              WHERE tenant_id=:'tid';
DELETE FROM street_sellers                 WHERE tenant_id=:'tid';
DELETE FROM sales_promoters                WHERE tenant_id=:'tid';
DELETE FROM internal_requests              WHERE tenant_id=:'tid';
DELETE FROM inventory_counts               WHERE tenant_id=:'tid';
DELETE FROM reservations                   WHERE tenant_id=:'tid';
DELETE FROM promotions                     WHERE tenant_id=:'tid';
DELETE FROM vouchers                       WHERE tenant_id=:'tid';
DELETE FROM expenses                       WHERE tenant_id=:'tid';
DELETE FROM petty_cash                     WHERE tenant_id=:'tid';
DELETE FROM cierres_de_caja                WHERE tenant_id=:'tid';
DELETE FROM income_entries                 WHERE tenant_id=:'tid';
DELETE FROM notifications                  WHERE tenant_id=:'tid';
DELETE FROM audit_logs                     WHERE tenant_id=:'tid';
DELETE FROM bot_conversation               WHERE tenant_id=:'tid';
DELETE FROM bot_config                     WHERE tenant_id=:'tid';

-- ---- Nivel 3: stock (después de soltar todas las referencias a unidades) ---
DELETE FROM stock_transfers                WHERE tenant_id=:'tid';
DELETE FROM stock_movements                WHERE tenant_id=:'tid';
DELETE FROM stock_units                    WHERE tenant_id=:'tid';
DELETE FROM stock                          WHERE tenant_id=:'tid';

-- ---- Nivel 4: catálogo de productos ---------------------------------------
DELETE FROM product_variants               WHERE tenant_id=:'tid';
DELETE FROM products                       WHERE tenant_id=:'tid';

\echo '=== DESPUÉS · lo que se BORRA (debe ser todo 0) ==='
SELECT
  (SELECT count(*) FROM products         WHERE tenant_id=:'tid') AS products,
  (SELECT count(*) FROM product_variants WHERE tenant_id=:'tid') AS variants,
  (SELECT count(*) FROM stock            WHERE tenant_id=:'tid') AS stock,
  (SELECT count(*) FROM stock_units      WHERE tenant_id=:'tid') AS units,
  (SELECT count(*) FROM sales            WHERE tenant_id=:'tid') AS sales,
  (SELECT count(*) FROM purchase_orders  WHERE tenant_id=:'tid') AS compras,
  (SELECT count(*) FROM returns          WHERE tenant_id=:'tid') AS devol,
  (SELECT count(*) FROM accounts_receivable WHERE tenant_id=:'tid') AS cxc,
  (SELECT count(*) FROM accounts_payable WHERE tenant_id=:'tid') AS cxp,
  (SELECT count(*) FROM expenses         WHERE tenant_id=:'tid') AS gastos,
  (SELECT count(*) FROM inventory_counts WHERE tenant_id=:'tid') AS conteos;

\echo '=== DESPUÉS · lo que se CONSERVA (debe quedar igual) ==='
SELECT
  (SELECT count(*) FROM warehouses  WHERE tenant_id=:'tid') AS bodegas,
  (SELECT count(*) FROM clients     WHERE tenant_id=:'tid') AS clientes,
  (SELECT count(*) FROM suppliers   WHERE tenant_id=:'tid') AS proveedores,
  (SELECT count(*) FROM brands      WHERE tenant_id=:'tid') AS marcas,
  (SELECT count(*) FROM colors      WHERE tenant_id=:'tid') AS colores,
  (SELECT count(*) FROM sizes       WHERE tenant_id=:'tid') AS tallas,
  (SELECT count(*) FROM categories  WHERE tenant_id=:'tid') AS categorias,
  (SELECT count(*) FROM users       WHERE tenant_id=:'tid') AS usuarios,
  (SELECT count(*) FROM consignments WHERE tenant_id=:'tid') AS terceros,
  (SELECT count(*) FROM third_party_products WHERE tenant_id=:'tid') AS libreta;

\if :apply
  COMMIT;
  \echo '>>> APLICADO (COMMIT). amawad como nuevo; solo terceros + infra + catálogos.'
\else
  ROLLBACK;
  \echo '>>> DRY-RUN (ROLLBACK): no se cambió nada. Corre con  -v apply=1  para aplicar.'
\endif
