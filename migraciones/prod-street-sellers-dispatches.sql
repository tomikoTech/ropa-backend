-- Fase 6: operación de calle — patinadores y remisión rápida (RRP-).
-- Correr en prod ANTES de desplegar el backend nuevo. Aditiva e idempotente.
--
-- El patinador es el vendedor que sale con mercancía y vuelve con la plata y con
-- lo que no vendió. La remisión rápida es esa entrega: la mercancía sale del
-- inventario, y al cuadrarla lo vendido se convierte en una venta de verdad
-- (entra a la caja y al cierre del día) y lo devuelto vuelve al inventario.
--
-- Nada cambia para los clientes actuales: las tablas nacen vacías.

CREATE TABLE IF NOT EXISTS street_sellers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  name            varchar     NOT NULL,
  -- Carnet con dígito verificador EAN: lo lee el mismo lector de las etiquetas.
  code            varchar     NOT NULL,
  document_number varchar,
  phone           varchar,
  notes           text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS street_dispatches (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid,
  dispatch_number  varchar     NOT NULL,
  street_seller_id uuid        NOT NULL REFERENCES street_sellers(id) ON DELETE RESTRICT,
  warehouse_id     uuid        NOT NULL REFERENCES warehouses(id)     ON DELETE RESTRICT,
  status           varchar     NOT NULL DEFAULT 'OPEN',
  created_by       uuid,
  settled_by       uuid,
  settled_at       timestamptz,
  sale_id          uuid,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS street_dispatch_items (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  dispatch_id       uuid    NOT NULL REFERENCES street_dispatches(id) ON DELETE CASCADE,
  variant_id        uuid    NOT NULL REFERENCES product_variants(id)  ON DELETE RESTRICT,
  -- Snapshots: si mañana cambia el nombre o el precio, lo despachado ayer sigue
  -- diciendo lo que decía.
  product_name      varchar NOT NULL,
  variant_sku       varchar NOT NULL,
  variant_size      varchar NOT NULL DEFAULT '',
  variant_color     varchar NOT NULL DEFAULT '',
  stock_unit_id     uuid,
  quantity          integer NOT NULL,
  unit_price        numeric(12,2) NOT NULL,
  unit_cost         numeric(12,2) NOT NULL DEFAULT 0,
  quantity_sold     integer NOT NULL DEFAULT 0,
  quantity_returned integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- El carnet y el consecutivo son únicos dentro de la tienda: dos patinadores con
-- el mismo código harían que el escáner trajera al equivocado.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_street_sellers_tenant_code"
  ON street_sellers (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_street_dispatches_tenant_number"
  ON street_dispatches (tenant_id, dispatch_number);

CREATE INDEX IF NOT EXISTS "IDX_street_sellers_tenant"        ON street_sellers        (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_street_dispatches_tenant"     ON street_dispatches     (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_street_dispatches_seller"     ON street_dispatches     (street_seller_id);
-- Para "qué tiene cada patinador en la calle ahora mismo".
CREATE INDEX IF NOT EXISTS "IDX_street_dispatches_status"     ON street_dispatches     (tenant_id, status);
CREATE INDEX IF NOT EXISTS "IDX_street_dispatch_items_tenant" ON street_dispatch_items (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_street_dispatch_items_disp"   ON street_dispatch_items (dispatch_id);

-- Canal de venta nuevo: la venta que sale de cuadrar una remisión. Sin esto el
-- backend nuevo no puede guardarla (el enum la rechaza).
-- `ADD VALUE IF NOT EXISTS` es idempotente y no bloquea la tabla.
ALTER TYPE sales_sale_channel_enum ADD VALUE IF NOT EXISTS 'CALLE';

-- Verificación (no modifica nada):
--   SELECT count(*) FROM street_sellers;     -- 0
--   SELECT unnest(enum_range(NULL::sales_sale_channel_enum));  -- incluye CALLE
