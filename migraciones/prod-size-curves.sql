-- Fase 2: curvas de tallas (el surtido que trae una caja).
-- Correr en prod ANTES de desplegar el backend nuevo.
-- Requiere: prod-catalogs-sizes-colors.sql (tabla sizes).
--
-- Una caja de calzado no viene con una sola talla sino con un reparto
-- (6 pares de 36, 6 de 37, 6 de 38, 6 de 39 = 24 pares). Eso es la curva.
--
-- El detalle va en tabla propia con FK a `sizes` (y no como JSON, que es como
-- lo guarda el sistema anterior): así se puede saber qué curvas usan una talla
-- y la base impide dejar referencias rotas.

CREATE TABLE IF NOT EXISTS size_curve_types (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid,
  name       varchar     NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS size_curves (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,
  curve_type_id uuid        REFERENCES size_curve_types(id) ON DELETE SET NULL,
  name          varchar     NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS size_curve_items (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  curve_id  uuid    NOT NULL REFERENCES size_curves(id) ON DELETE CASCADE,
  size_id   uuid    NOT NULL REFERENCES sizes(id)       ON DELETE RESTRICT,
  quantity  integer NOT NULL
);

-- Nombres únicos por tenant; una talla no puede repetirse dentro de una curva
-- (dejaría el surtido ambiguo).
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_size_curve_types_tenant_name" ON size_curve_types (tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_size_curves_tenant_name"      ON size_curves      (tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_size_curve_items_curve_size"  ON size_curve_items (curve_id, size_id);

CREATE INDEX IF NOT EXISTS "IDX_size_curve_types_tenant" ON size_curve_types (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_size_curves_tenant"      ON size_curves      (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_size_curve_items_tenant" ON size_curve_items (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_size_curve_items_curve"  ON size_curve_items (curve_id);
-- Para responder "¿qué curvas usan esta talla?" al intentar borrarla.
CREATE INDEX IF NOT EXISTS "IDX_size_curve_items_size"   ON size_curve_items (size_id);
