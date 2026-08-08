-- Fase 8: permisos granulares por módulo y acción, y bodegas por usuario.
-- Correr en prod ANTES de desplegar el backend nuevo. Aditiva e idempotente.
--
-- Reemplaza los roles fijos (SUPER_ADMIN / ADMIN / COLABORADOR) por una matriz
-- (módulo × acción) por rol, como la del sistema anterior — pero validada en el
-- servidor, no en el JavaScript.
--
-- ⚠️ NADA CAMBIA AL APLICARLA. Las tablas nacen vacías y
-- `users.access_role_id` nace en NULL, que significa "sin permisos granulares":
-- el usuario se comporta igual que hoy. Los permisos empiezan a aplicar solo
-- cuando alguien crea un rol y se lo asigna a un usuario.

CREATE TABLE IF NOT EXISTS access_roles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  name         varchar     NOT NULL,
  description  text,
  template_key varchar,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid,
  role_id    uuid    NOT NULL REFERENCES access_roles(id) ON DELETE CASCADE,
  module     varchar NOT NULL,
  can_list   boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit   boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS user_warehouses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  user_id      uuid        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  warehouse_id uuid        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Un rol por nombre dentro de la tienda; un módulo no puede aparecer dos veces
-- en el mismo rol (dejaría el permiso ambiguo); una bodega no se asigna dos
-- veces al mismo usuario.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_access_roles_tenant_name"
  ON access_roles (tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_role_permissions_role_module"
  ON role_permissions (role_id, module);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_warehouses_user_warehouse"
  ON user_warehouses (user_id, warehouse_id);

CREATE INDEX IF NOT EXISTS "IDX_access_roles_tenant"     ON access_roles     (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_role_permissions_tenant" ON role_permissions (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_role_permissions_role"   ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS "IDX_user_warehouses_tenant"  ON user_warehouses  (tenant_id);
-- El guard resuelve los permisos en cada petición: este índice es el que hace
-- que eso no se note.
CREATE INDEX IF NOT EXISTS "IDX_user_warehouses_user"    ON user_warehouses  (user_id);

-- Rol de acceso del usuario. NULL = como hoy.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS access_role_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_users_access_role'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT "FK_users_access_role"
      FOREIGN KEY (access_role_id) REFERENCES access_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_users_access_role" ON users (access_role_id);

-- Verificación (no modifica nada): debe dar 0 usuarios con rol de acceso.
--   SELECT count(*) FILTER (WHERE access_role_id IS NOT NULL) AS con_rol,
--          count(*) AS usuarios
--   FROM users;
