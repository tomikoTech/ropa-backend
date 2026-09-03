-- Habilita el módulo Gastos (expenses) al rol "Revendedor (persona natural)".
--
-- Por qué hace falta: los permisos de un rol se siembran UNA sola vez, cuando
-- se crea el tenant desde la plantilla. Un revendedor creado ANTES de que la
-- plantilla incluyera `expenses` no tiene esa fila en role_permissions, y por
-- eso el frontend dice «tu rol no tiene permiso de Ver en Egresos y caja menor».
--
-- Este script solo AGREGA/CORRIGE la fila (role_id, 'expenses') con ver+crear+
-- editar (sin borrar), igual que la plantilla. Es idempotente: correrlo dos
-- veces no cambia nada. No toca ningún otro módulo ni ningún otro rol.
--
-- Uso (desde tu terminal, con la URL pública de prod):
--   psql "$PROD_DB_URL" -f scripts/revendedor-habilitar-gastos.sql

BEGIN;

-- 1) A quién le vamos a tocar los permisos (para que veas antes de aplicar).
SELECT r.id AS role_id, r.tenant_id, r.name
FROM access_roles r
WHERE r.template_key = 'revendedor'
   OR r.name = 'Revendedor (persona natural)';

-- 2) Insertar (o corregir) la fila de Gastos para esos roles.
INSERT INTO role_permissions
  (id, role_id, tenant_id, module, can_list, can_create, can_edit, can_delete)
SELECT
  gen_random_uuid(), r.id, r.tenant_id, 'expenses', true, true, true, false
FROM access_roles r
WHERE r.template_key = 'revendedor'
   OR r.name = 'Revendedor (persona natural)'
ON CONFLICT (role_id, module) DO UPDATE
  SET can_list = true, can_create = true, can_edit = true;

-- 3) Ver el resultado.
SELECT r.name, p.module, p.can_list, p.can_create, p.can_edit, p.can_delete
FROM role_permissions p
JOIN access_roles r ON r.id = p.role_id
WHERE p.module = 'expenses'
  AND (r.template_key = 'revendedor' OR r.name = 'Revendedor (persona natural)');

COMMIT;
