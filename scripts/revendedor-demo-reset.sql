-- Deja la cuenta demo de un revendedor "como nueva": borra TODOS sus datos de
-- negocio (ventas de terceros, abonos, libreta, gastos, caja menor y clientes)
-- pero conserva la tienda, el usuario, su rol y permisos, y la configuración.
-- Así puede entrar y ver todo en cero para una demostración.
--
-- Acotado por tenant: resuelve el tenant a partir del CORREO y solo toca filas
-- de ESE tenant. No afecta a ninguna otra tienda.
--
-- Modo ENSAYO por defecto (solo muestra qué borraría). Para aplicar de verdad:
--   psql "$PROD_DB_URL" -v apply=1 -f scripts/revendedor-demo-reset.sql
--
-- El correo se puede cambiar con -v correo='otro@correo.com'.

\set ON_ERROR_STOP on
\if :{?correo}
\else
  \set correo 'revendedor-demo@gmail.com'
\endif

-- 1) Resolver el tenant (falla si el correo no existe, para no borrar de más).
SELECT id AS uid, tenant_id AS tid, email
FROM users WHERE email = :'correo' \gset

\echo '--- Cuenta objetivo ---'
SELECT :'email' AS correo, :'tid' AS tenant_id;

-- 2) Qué hay hoy (previsualización).
\echo '--- Datos actuales de esta cuenta ---'
SELECT 'consignments'          AS tabla, count(*) FROM consignments          WHERE tenant_id = :'tid'
UNION ALL SELECT 'consignment_payments', count(*) FROM consignment_payments  WHERE tenant_id = :'tid'
UNION ALL SELECT 'third_party_products', count(*) FROM third_party_products  WHERE tenant_id = :'tid'
UNION ALL SELECT 'expenses',             count(*) FROM expenses              WHERE tenant_id = :'tid'
UNION ALL SELECT 'petty_cash',           count(*) FROM petty_cash            WHERE tenant_id = :'tid'
UNION ALL SELECT 'clients',              count(*) FROM clients               WHERE tenant_id = :'tid'
ORDER BY tabla;

\if :{?apply}
  \echo '--- APLICANDO: borrando datos de negocio de esta cuenta ---'
  BEGIN;
    -- Orden por dependencias: abonos → ventas → libreta;
    -- gastos ANTES que caja menor (expenses.petty_cash_id → petty_cash);
    -- clientes al final.
    DELETE FROM consignment_payments WHERE tenant_id = :'tid';
    DELETE FROM consignments         WHERE tenant_id = :'tid';
    DELETE FROM third_party_products WHERE tenant_id = :'tid';
    DELETE FROM expenses             WHERE tenant_id = :'tid';
    DELETE FROM petty_cash           WHERE tenant_id = :'tid';
    DELETE FROM clients              WHERE tenant_id = :'tid';
  COMMIT;

  \echo '--- Resultado (todo debe quedar en 0) ---'
  SELECT 'consignments'          AS tabla, count(*) FROM consignments          WHERE tenant_id = :'tid'
  UNION ALL SELECT 'consignment_payments', count(*) FROM consignment_payments  WHERE tenant_id = :'tid'
  UNION ALL SELECT 'third_party_products', count(*) FROM third_party_products  WHERE tenant_id = :'tid'
  UNION ALL SELECT 'expenses',             count(*) FROM expenses              WHERE tenant_id = :'tid'
  UNION ALL SELECT 'petty_cash',           count(*) FROM petty_cash            WHERE tenant_id = :'tid'
  UNION ALL SELECT 'clients',              count(*) FROM clients               WHERE tenant_id = :'tid'
  ORDER BY tabla;
\else
  \echo ''
  \echo 'ENSAYO: no se borró nada. Para aplicar de verdad:'
  \echo '  psql "$PROD_DB_URL" -v apply=1 -f scripts/revendedor-demo-reset.sql'
\endif
