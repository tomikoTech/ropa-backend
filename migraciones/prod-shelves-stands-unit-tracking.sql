-- Fase 1 (cierre): ubicaciones físicas (estanterías/stands) e inventario por unidades.
-- Correr en prod ANTES de desplegar el backend nuevo.
--
-- Estanterías y stands dan la ubicación física dentro de la bodega: permiten
-- saber DÓNDE está una unidad, no solo cuántas hay.
--
-- `unit_tracking` es el interruptor del inventario por unidades etiquetadas
-- (cajas con código propio). Queda **apagado por defecto**: los tenants
-- actuales siguen exactamente igual que hoy.

CREATE TABLE IF NOT EXISTS shelves (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  warehouse_id uuid        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name         varchar     NOT NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stands (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid,
  shelf_id   uuid        NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  name       varchar     NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- El nombre es único dentro de su contenedor, no del tenant: dos bodegas
-- pueden tener cada una su estantería "A".
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shelves_wh_name"  ON shelves (tenant_id, warehouse_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stands_shelf_name" ON stands  (tenant_id, shelf_id, name);

CREATE INDEX IF NOT EXISTS "IDX_shelves_tenant" ON shelves (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_stands_tenant"  ON stands  (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_shelves_wh"     ON shelves (warehouse_id);
CREATE INDEX IF NOT EXISTS "IDX_stands_shelf"   ON stands  (shelf_id);

-- Interruptor por tienda y opt-in por producto. Ambos en false: nada cambia
-- para quien no lo active.
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS unit_tracking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit_tracking boolean NOT NULL DEFAULT false;
