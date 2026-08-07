-- Fase 1 del plan de paridad con demachine: catálogos de tallas y colores.
-- Correr en prod ANTES de desplegar el backend nuevo.
--
-- Las variantes siguen guardando talla/color como TEXTO; estas tablas son el
-- catálogo gestionable y aportan el id estable que necesitan las curvas de
-- tallas y los renglones de compra por cajas.
--
-- Después de desplegar, poblar los catálogos con:
--   node dist/seeds/backfill-catalogs.js        (DRY_RUN=1 para simular)

CREATE TABLE IF NOT EXISTS sizes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  name        varchar     NOT NULL,
  size_group  varchar,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS colors (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  name        varchar     NOT NULL,
  hex         varchar,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Unicidad por tenant (equivale a @Unique(['tenantId','name'])).
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sizes_tenant_name"  ON sizes  (tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_colors_tenant_name" ON colors (tenant_id, name);

-- Índice de tenant (equivale a @Index() de TenantAwareEntity).
CREATE INDEX IF NOT EXISTS "IDX_sizes_tenant"  ON sizes  (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_colors_tenant" ON colors (tenant_id);
