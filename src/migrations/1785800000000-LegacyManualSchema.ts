/* eslint-disable prettier/prettier -- El SQL va copiado tal cual de
   `migraciones/*.sql`, que es lo que ya se aplicó en producción. Dejar que el
   formateador lo reindente cambiaría el texto que se ejecuta y volvería
   imposible compararlo con el original. */
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El esquema que hasta ahora se aplicaba a mano desde `migraciones/*.sql`.
 *
 * Esos archivos se corrían uno por uno antes de cada despliegue, y esa es
 * exactamente la clase de paso que se olvida: si el SQL no se corrió, el
 * backend arranca igual y falla después, en producción, cuando alguien abre la
 * pantalla nueva. Aquí el mismo SQL —el que ya está aplicado en producción— se
 * ejecuta solo al bootear (`migrationsRun`).
 *
 * **Todo es aditivo e idempotente** (`IF NOT EXISTS`, bloques `DO $$` que
 * revisan antes de crear, y los dos `UPDATE` de relleno solo tocan filas
 * vacías). En una base donde ya se aplicó a mano, esta migración no cambia
 * nada: se registra y sigue. En una base nueva, crea todo.
 *
 * Los archivos de `migraciones/` quedan como referencia histórica; **lo nuevo
 * va aquí**, en una migración de TypeORM.
 */
export class LegacyManualSchema1785800000000 implements MigrationInterface {
  name = 'LegacyManualSchema1785800000000';

  /** En el orden en que se aplicaron en producción; hay dependencias entre ellos. */
  private readonly steps: { name: string; title: string; sql: string }[] = [
  {
    name: 'prod-sales-is-paid.sql',
    title: 'Marca de venta pagada',
    sql: `
-- Feature "marcar como pagado": ventas no-crédito pueden quedar pendientes.
-- Correr en prod ANTES de desplegar el backend nuevo.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true;
`,
  },
  {
    name: 'prod-catalogs-sizes-colors.sql',
    title: 'Catálogos de tallas y colores',
    sql: `
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
`,
  },
  {
    name: 'prod-variant-size-color-fk.sql',
    title: 'Variantes con FK a talla y color',
    sql: `
-- Fase 1b: talla y color de la variante pasan a CLAVE FORÁNEA.
-- Correr en prod ANTES de desplegar el backend nuevo.
-- Requiere haber corrido antes: prod-catalogs-sizes-colors.sql
--
-- Patrón expand-migrate-contract (3 pasos, sin downtime):
--   [1] EXPAND   <- este archivo: agrega size_id/color_id sin quitar nada.
--                   El backend anterior sigue funcionando con las columnas de
--                   texto mientras se despliega el nuevo.
--   [2] MIGRATE  <- node dist/seeds/backfill-catalogs.js  (vincula las FK)
--   [3] CONTRACT <- prod-variant-drop-size-color-text.sql (elimina el texto),
--                   solo cuando ya no quede código leyendo variant.size/color.

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size_id  uuid;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_id uuid;

-- ON DELETE RESTRICT: borrar del catálogo una talla en uso debe fallar, no
-- dejar variantes huérfanas en silencio. El servicio ya avisa antes de borrar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_product_variants_size'
  ) THEN
    ALTER TABLE product_variants
      ADD CONSTRAINT "FK_product_variants_size"
      FOREIGN KEY (size_id) REFERENCES sizes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_product_variants_color'
  ) THEN
    ALTER TABLE product_variants
      ADD CONSTRAINT "FK_product_variants_color"
      FOREIGN KEY (color_id) REFERENCES colors(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Índices: se filtra y agrupa por talla/color constantemente (inventario,
-- reportes, curvas). Sin ellos la FK no aporta rendimiento.
CREATE INDEX IF NOT EXISTS "IDX_product_variants_size"  ON product_variants (size_id);
CREATE INDEX IF NOT EXISTS "IDX_product_variants_color" ON product_variants (color_id);
`,
  },
  {
    name: 'prod-variant-drop-size-color-text.sql',
    title: 'Se sueltan los textos de talla/color',
    sql: `
-- Fase 1c (CONTRACT): elimina las columnas de texto de la variante.
--
-- ⚠️ CORRER **DESPUÉS** de desplegar el backend que ya usa \`sizeName\`/\`colorName\`,
--    NO antes. Mientras el backend viejo esté vivo sigue leyendo \`size\`/\`color\`.
--
-- Orden completo de la migración:
--   1. prod-catalogs-sizes-colors.sql        (crea sizes/colors)
--   2. prod-variant-size-color-fk.sql        (agrega size_id/color_id + FK)
--   3. node dist/seeds/backfill-catalogs.js  (puebla catálogo y vincula FK)
--   4. desplegar backend nuevo
--   5. este archivo                          (elimina el texto heredado)
--
-- Comprobación previa OBLIGATORIA: no debe quedar ninguna variante con texto
-- pero sin FK, o se perdería información al soltar las columnas.
--
-- La comprobación se salta sola si las columnas ya no están (o sea, si esto ya
-- se corrió): sin ese \`IF\`, volver a ejecutarlo fallaba con "column size does
-- not exist", y eso tumbaría el arranque al correr las migraciones.
DO $$
DECLARE
  huerfanas integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'product_variants' AND column_name IN ('size', 'color')
  ) THEN
    EXECUTE $q$
      SELECT COUNT(*)
        FROM product_variants
       WHERE (COALESCE(TRIM(size), '')  <> '' AND size_id  IS NULL)
          OR (COALESCE(TRIM(color), '') <> '' AND color_id IS NULL)
    $q$ INTO huerfanas;

    IF huerfanas > 0 THEN
      RAISE EXCEPTION
        'Hay % variante(s) con talla/color en texto pero sin FK. Corre backfill-catalogs antes de soltar las columnas.',
        huerfanas;
    END IF;
  END IF;
END $$;

ALTER TABLE product_variants DROP COLUMN IF EXISTS size;
ALTER TABLE product_variants DROP COLUMN IF EXISTS color;
`,
  },
  {
    name: 'prod-shelves-stands-unit-tracking.sql',
    title: 'Estanterías, stands y trazabilidad',
    sql: `
-- Fase 1 (cierre): ubicaciones físicas (estanterías/stands) e inventario por unidades.
-- Correr en prod ANTES de desplegar el backend nuevo.
--
-- Estanterías y stands dan la ubicación física dentro de la bodega: permiten
-- saber DÓNDE está una unidad, no solo cuántas hay.
--
-- \`unit_tracking\` es el interruptor del inventario por unidades etiquetadas
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
`,
  },
  {
    name: 'prod-size-curves.sql',
    title: 'Curvas de tallas',
    sql: `
-- Fase 2: curvas de tallas (el surtido que trae una caja).
-- Correr en prod ANTES de desplegar el backend nuevo.
-- Requiere: prod-catalogs-sizes-colors.sql (tabla sizes).
--
-- Una caja de calzado no viene con una sola talla sino con un reparto
-- (6 pares de 36, 6 de 37, 6 de 38, 6 de 39 = 24 pares). Eso es la curva.
--
-- El detalle va en tabla propia con FK a \`sizes\` (y no como JSON, que es como
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
`,
  },
  {
    name: 'prod-purchase-boxes-landed-cost.sql',
    title: 'Compras por cajas y costo en bodega',
    sql: `
-- Fase 3: compra por cajas y costeo de importación (landed cost).
-- Correr en prod ANTES de desplegar el backend nuevo.
-- Requiere: prod-size-curves.sql y prod-catalogs-sizes-colors.sql.
--
-- Todo es ADITIVO: las órdenes de compra existentes siguen igual. Los campos
-- de importación quedan en valores neutros (tasa 1, sin fletes), así que una
-- compra local no cambia en nada.

-- ── Costeo de importación en la orden ────────────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(14,4) NOT NULL DEFAULT 1;
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS freight_costs jsonb NOT NULL DEFAULT '[]';
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS freight_allocation varchar NOT NULL DEFAULT 'BY_UNITS';
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS arrival_date date;

-- ── Renglones por caja ───────────────────────────────────────────────────
-- Una caja NO es una variante: trae varias tallas a la vez (las de la curva),
-- por eso la línea apunta a producto + color y no a variant_id.
CREATE TABLE IF NOT EXISTS purchase_box_lines (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  purchase_order_id uuid          NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        uuid          NOT NULL REFERENCES products(id)        ON DELETE RESTRICT,
  color_id          uuid          REFERENCES colors(id)                    ON DELETE RESTRICT,
  size_curve_id     uuid          REFERENCES size_curves(id)               ON DELETE RESTRICT,
  boxes             integer       NOT NULL,
  units_per_box     integer       NOT NULL,
  unit_cost         numeric(14,2) NOT NULL,
  sale_price        numeric(14,2),
  consecutive       integer       NOT NULL,
  boxes_received    integer       NOT NULL DEFAULT 0,
  comment           text,
  is_active         boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_purchase_box_lines_tenant" ON purchase_box_lines (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_purchase_box_lines_order"  ON purchase_box_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS "IDX_purchase_box_lines_curve"  ON purchase_box_lines (size_curve_id);
`,
  },
  {
    name: 'prod-stock-units.sql',
    title: 'Bultos etiquetados',
    sql: `
-- Fase 4: inventario por unidades etiquetadas (bultos con código de barras).
-- Correr en prod ANTES de desplegar el backend nuevo.
-- Requiere: prod-shelves-stands-unit-tracking.sql y prod-purchase-boxes-landed-cost.sql
--
-- Capa granular que convive con \`stock\` (que sigue siendo el agregado por
-- variante y bodega). Solo se llena para productos con unit_tracking, así que
-- los tenants actuales no se ven afectados.

DO $$ BEGIN
  CREATE TYPE stock_unit_kind_enum AS ENUM ('BOX', 'UNIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stock_unit_status_enum AS ENUM
    ('IN_STOCK', 'SOLD', 'CONSIGNED', 'TRANSFERRED', 'WRITTEN_OFF', 'SPLIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stock_units (
  id                   uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid,
  barcode              varchar                NOT NULL,
  kind                 stock_unit_kind_enum   NOT NULL,
  status               stock_unit_status_enum NOT NULL DEFAULT 'IN_STOCK',
  product_id           uuid NOT NULL REFERENCES products(id)         ON DELETE RESTRICT,
  color_id             uuid          REFERENCES colors(id)           ON DELETE RESTRICT,
  size_id              uuid          REFERENCES sizes(id)            ON DELETE RESTRICT,
  variant_id           uuid          REFERENCES product_variants(id) ON DELETE SET NULL,
  warehouse_id         uuid NOT NULL REFERENCES warehouses(id)       ON DELETE RESTRICT,
  stand_id             uuid          REFERENCES stands(id)           ON DELETE SET NULL,
  quantity             integer       NOT NULL DEFAULT 1,
  cost                 numeric(14,2) NOT NULL DEFAULT 0,
  purchase_box_line_id uuid,
  parent_unit_id       uuid,
  printed_at           timestamptz,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

-- El código impreso es único por tienda: es lo que se escanea para vender.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_units_tenant_barcode"
  ON stock_units (tenant_id, barcode);

-- Consulta más frecuente: qué hay disponible en una bodega.
CREATE INDEX IF NOT EXISTS "IDX_stock_units_wh_status"
  ON stock_units (tenant_id, warehouse_id, status);
CREATE INDEX IF NOT EXISTS "IDX_stock_units_box_line" ON stock_units (purchase_box_line_id);
CREATE INDEX IF NOT EXISTS "IDX_stock_units_parent"   ON stock_units (parent_unit_id);
`,
  },
  {
    name: 'prod-expenses-petty-cash.sql',
    title: 'Egresos y caja menor',
    sql: `
-- Fase 7: egresos y caja menor.
-- Correr en prod ANTES de desplegar el backend nuevo.
--
-- MiPinta ya registraba ingresos; esto cierra la otra mitad para poder saber
-- cuánto queda de verdad, no solo cuánto entró.

CREATE TABLE IF NOT EXISTS expense_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  name        varchar     NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expense_categories_tenant_name"
  ON expense_categories (tenant_id, name);

CREATE TABLE IF NOT EXISTS petty_cash (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,
  warehouse_id  uuid          REFERENCES warehouses(id) ON DELETE RESTRICT,
  name          varchar       NOT NULL,
  funded_amount numeric(14,2) NOT NULL DEFAULT 0,
  is_active     boolean       NOT NULL DEFAULT true,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid,
  expense_number varchar       NOT NULL,
  category_id    uuid          REFERENCES expense_categories(id) ON DELETE RESTRICT,
  warehouse_id   uuid          REFERENCES warehouses(id)         ON DELETE RESTRICT,
  description    varchar       NOT NULL,
  amount         numeric(14,2) NOT NULL,
  payment_method varchar,
  bank_id        uuid,
  petty_cash_id  uuid          REFERENCES petty_cash(id)         ON DELETE RESTRICT,
  expense_date   date          NOT NULL,
  notes          text,
  created_by     uuid,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

-- El consecutivo no se repite dentro de la tienda.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expenses_tenant_number" ON expenses (tenant_id, expense_number);
CREATE INDEX IF NOT EXISTS "IDX_expenses_tenant_date" ON expenses (tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS "IDX_expenses_petty_cash" ON expenses (petty_cash_id);
CREATE INDEX IF NOT EXISTS "IDX_petty_cash_tenant"   ON petty_cash (tenant_id);
`,
  },
  {
    name: 'prod-vouchers.sql',
    title: 'Bonos de regalo',
    sql: `
-- Fase 5: bonos / cupones de regalo.
-- Correr en prod ANTES de desplegar el backend nuevo.
--
-- Un valor al portador que se descuenta en el POS. A diferencia de una
-- promoción es de UN SOLO USO: al canjearlo queda consumido.

DO $$ BEGIN
  CREATE TYPE voucher_status_enum AS ENUM ('ACTIVE', 'REDEEMED', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vouchers (
  id               uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid,
  barcode          varchar             NOT NULL,
  amount           numeric(14,2)       NOT NULL,
  status           voucher_status_enum NOT NULL DEFAULT 'ACTIVE',
  expires_at       timestamptz,
  comment          text,
  redeemed_sale_id uuid,
  redeemed_at      timestamptz,
  created_by       uuid,
  created_at       timestamptz         NOT NULL DEFAULT now(),
  updated_at       timestamptz         NOT NULL DEFAULT now()
);

-- El código es lo que se escanea: único por tienda.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_vouchers_tenant_barcode" ON vouchers (tenant_id, barcode);
CREATE INDEX IF NOT EXISTS "IDX_vouchers_tenant_status" ON vouchers (tenant_id, status);
`,
  },
  {
    name: 'prod-inventory-counts.sql',
    title: 'Conteos físicos',
    sql: `
-- Fase 6: conteo físico de inventario (las "verificaciones" del sistema anterior).
-- Correr en prod ANTES de desplegar el backend nuevo.
--
-- Se abre una ventana de conteo, se escanea lo que hay, y al cerrarla se
-- comparan las cantidades contra las del sistema. Las diferencias se calculan,
-- no se guardan, para que no puedan contradecir al conteo.

DO $$ BEGIN
  CREATE TYPE inventory_count_status_enum AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inventory_counts (
  id           uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  count_number varchar                     NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  status       inventory_count_status_enum NOT NULL DEFAULT 'OPEN',
  started_at   timestamptz                 NOT NULL,
  closed_at    timestamptz,
  notes        text,
  created_by   uuid,
  created_at   timestamptz                 NOT NULL DEFAULT now(),
  updated_at   timestamptz                 NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid,
  count_id         uuid NOT NULL REFERENCES inventory_counts(id)  ON DELETE CASCADE,
  variant_id       uuid NOT NULL REFERENCES product_variants(id)  ON DELETE RESTRICT,
  counted_quantity integer     NOT NULL DEFAULT 0,
  expected_quantity integer    NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_count_lines
  ADD COLUMN IF NOT EXISTS expected_quantity integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_count_expected_units (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,
  count_id      uuid        NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  stock_unit_id uuid        NOT NULL REFERENCES stock_units(id) ON DELETE RESTRICT,
  barcode       varchar     NOT NULL,
  quantity      integer     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_count_scans (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid,
  count_id       uuid        NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  client_scan_id varchar     NOT NULL,
  device_id      varchar,
  barcode        varchar     NOT NULL,
  stock_unit_id  uuid        REFERENCES stock_units(id) ON DELETE RESTRICT,
  result         varchar     NOT NULL,
  quantity       integer     NOT NULL DEFAULT 0,
  message        text        NOT NULL,
  scanned_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_counts_tenant_number"
  ON inventory_counts (tenant_id, count_number);
-- Una variante aparece una sola vez por conteo: lo contado se acumula ahi.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_count_lines_count_variant"
  ON inventory_count_lines (count_id, variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_count_expected_unit"
  ON inventory_count_expected_units (count_id, stock_unit_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_count_scan_client"
  ON inventory_count_scans (count_id, client_scan_id);
CREATE INDEX IF NOT EXISTS "IDX_inventory_count_expected_count"
  ON inventory_count_expected_units (tenant_id, count_id);
CREATE INDEX IF NOT EXISTS "IDX_inventory_count_scans_count_created"
  ON inventory_count_scans (tenant_id, count_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "IDX_inventory_counts_wh" ON inventory_counts (tenant_id, warehouse_id, status);
`,
  },
  {
    name: 'prod-sale-items-unit-cost.sql',
    title: 'Costo histórico en la línea de venta',
    sql: `
-- Fase 9 (reportes): costo unitario como SNAPSHOT en la línea de venta.
-- Correr en prod ANTES de desplegar el backend nuevo. Aditiva e idempotente.
--
-- Por qué: la utilidad se calculaba (donde se calculaba) contra
-- \`products.cost_price\`, que es el costo de HOY. Con eso, subir el costo de un
-- producto reescribe la utilidad de todas sus ventas pasadas. El costo va con
-- la línea, igual que ya van el nombre, la talla y el precio.
--
-- El valor neutro es 0, que los reportes leen como "sin costo registrado" y
-- cuentan aparte: si lo tomaran como costo cero, mostrarían 100% de margen.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,2) NOT NULL DEFAULT 0;

-- Relleno histórico: la mejor estimación disponible es el costo actual del
-- producto. Es una aproximación (no había snapshot), pero deja los reportes
-- utilizables desde el primer día; dejarlo en 0 haría ver toda la historia
-- con margen del 100%, que es un número peor que uno aproximado.
--
-- Solo toca filas en 0, así que correrlo dos veces no pisa lo que ya escribió
-- el POS nuevo.
UPDATE sale_items si
SET    unit_cost = p.cost_price
FROM   product_variants v
JOIN   products p ON p.id = v.product_id
WHERE  si.variant_id = v.id
  AND  si.unit_cost = 0
  AND  p.cost_price > 0
  -- Cinturón de seguridad multi-tenant: la variante debe ser del mismo tenant
  -- que la línea. No debería haber cruces, pero una migración no es el lugar
  -- para confiar en eso.
  AND  (si.tenant_id IS NULL OR v.tenant_id = si.tenant_id);

-- Verificación (no modifica nada): cuántas líneas quedan sin costo y qué peso
-- tienen. Si el número es alto, los reportes de utilidad lo van a decir.
--   SELECT count(*) FILTER (WHERE unit_cost = 0) AS sin_costo,
--          count(*)                              AS total
--   FROM sale_items;
`,
  },
  {
    name: 'prod-access-roles-permissions.sql',
    title: 'Roles, permisos y bodegas por usuario',
    sql: `
-- Fase 8: permisos granulares por módulo y acción, y bodegas por usuario.
-- Correr en prod ANTES de desplegar el backend nuevo. Aditiva e idempotente.
--
-- Reemplaza los roles fijos (SUPER_ADMIN / ADMIN / COLABORADOR) por una matriz
-- (módulo × acción) por rol, como la del sistema anterior — pero validada en el
-- servidor, no en el JavaScript.
--
-- ⚠️ NADA CAMBIA AL APLICARLA. Las tablas nacen vacías y
-- \`users.access_role_id\` nace en NULL, que significa "sin permisos granulares":
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
`,
  },
  {
    name: 'prod-street-sellers-dispatches.sql',
    title: 'Patinadores y remisión rápida',
    sql: `
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
-- \`ADD VALUE IF NOT EXISTS\` es idempotente y no bloquea la tabla.
ALTER TYPE sales_sale_channel_enum ADD VALUE IF NOT EXISTS 'CALLE';

-- Verificación (no modifica nada):
--   SELECT count(*) FROM street_sellers;     -- 0
--   SELECT unnest(enum_range(NULL::sales_sale_channel_enum));  -- incluye CALLE
`,
  },
  {
    name: 'prod-purchase-import-pos-gaps.sql',
    title: 'Importación de compras y huecos del POS',
    sql: `
-- Cierre de F3/F5: importación de compras (sin esquema nuevo) y paridad POS.
-- Aditiva e idempotente. Correr ANTES del backend nuevo.

ALTER TYPE sales_sale_channel_enum ADD VALUE IF NOT EXISTS 'INSTAGRAM';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS minimum_sale_price numeric(12,2);

CREATE TABLE IF NOT EXISTS sales_promoters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid,
  name       varchar NOT NULL,
  phone      varchar,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sales_promoters_tenant_name"
  ON sales_promoters (tenant_id, name);
CREATE INDEX IF NOT EXISTS "IDX_sales_promoters_tenant"
  ON sales_promoters (tenant_id);

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS promoter_id uuid,
  ADD COLUMN IF NOT EXISTS promoter_name varchar;

CREATE INDEX IF NOT EXISTS "IDX_sale_items_promoter"
  ON sale_items (tenant_id, promoter_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'FK_sale_items_promoter'
  ) THEN
    ALTER TABLE sale_items
      ADD CONSTRAINT "FK_sale_items_promoter"
      FOREIGN KEY (promoter_id) REFERENCES sales_promoters(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Cajas recibidas antes de este despliegue: enlazar una variante compatible
-- para que el POS pueda venderlas. La caja conserva producto/color/curva como
-- fuente de verdad; esta FK es el puente con el stock agregado.
UPDATE stock_units su
SET variant_id = (
  SELECT pv.id
  FROM product_variants pv
  WHERE pv.product_id = su.product_id
    AND pv.tenant_id IS NOT DISTINCT FROM su.tenant_id
    AND (su.color_id IS NULL OR pv.color_id = su.color_id)
    AND (su.size_id IS NULL OR pv.size_id = su.size_id)
    AND pv.is_active = true
  ORDER BY pv.created_at, pv.id
  LIMIT 1
)
WHERE su.variant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM product_variants pv
    WHERE pv.product_id = su.product_id
      AND pv.tenant_id IS NOT DISTINCT FROM su.tenant_id
      AND (su.color_id IS NULL OR pv.color_id = su.color_id)
      AND (su.size_id IS NULL OR pv.size_id = su.size_id)
      AND pv.is_active = true
  );

-- Verificación:
-- SELECT count(*) FROM sales_promoters;
-- SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
--   WHERE t.typname='sales_sale_channel_enum' AND enumlabel='INSTAGRAM';
`,
  },
  {
    name: 'prod-stock-unit-contents.sql',
    title: 'Contenido de cada caja',
    sql: `
-- Contenido esperado/real de cada caja física.
-- Aditiva e idempotente. Ejecutar antes del backend que expone
-- POST /stock-units/:id/contents.

CREATE TABLE IF NOT EXISTS stock_unit_contents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  box_unit_id       uuid NOT NULL REFERENCES stock_units(id) ON DELETE CASCADE,
  size_id           uuid NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  variant_id        uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  expected_quantity integer NOT NULL DEFAULT 0 CHECK (expected_quantity >= 0),
  actual_quantity   integer NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_stock_unit_contents_box_size" UNIQUE (box_unit_id, size_id)
);

CREATE INDEX IF NOT EXISTS "IDX_stock_unit_contents_tenant"
  ON stock_unit_contents (tenant_id);
CREATE INDEX IF NOT EXISTS "IDX_stock_unit_contents_box"
  ON stock_unit_contents (box_unit_id);
`,
  },
  {
    name: 'prod-stock-unit-trace.sql',
    title: 'Historial de cada código físico',
    sql: `
-- Trazabilidad por código físico: venta exacta + historial append-only.
-- Aditiva e idempotente. Ejecutar antes del backend B2.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid;

DO $$ BEGIN
  ALTER TABLE sale_items
    ADD CONSTRAINT "FK_sale_items_stock_unit"
    FOREIGN KEY (stock_unit_id) REFERENCES stock_units(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "IDX_sale_items_stock_unit"
  ON sale_items (stock_unit_id);

DO $$ BEGIN
  CREATE TYPE stock_unit_event_type_enum AS ENUM (
    'RECEIVED', 'CONTENT_UPDATED', 'PRINTED', 'SPLIT', 'CREATED_FROM_BOX',
    'SOLD', 'CONSIGNED', 'RETURNED', 'WRITTEN_OFF', 'TRANSFERRED', 'IMPORTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stock_unit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid,
  stock_unit_id  uuid NOT NULL REFERENCES stock_units(id) ON DELETE RESTRICT,
  event_type     stock_unit_event_type_enum NOT NULL,
  from_status    varchar,
  to_status      varchar,
  reference_type varchar,
  reference_id   uuid,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_stock_unit_events_trace"
  ON stock_unit_events (tenant_id, stock_unit_id, created_at);
`,
  },
  {
    name: 'prod-physical-returns.sql',
    title: 'Devoluciones y cambios físicos',
    sql: `
BEGIN;

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS price_difference numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_method varchar,
  ADD COLUMN IF NOT EXISTS settlement_bank_id uuid,
  ADD COLUMN IF NOT EXISTS settlement_reference varchar,
  ADD COLUMN IF NOT EXISTS received_by_id uuid,
  ADD COLUMN IF NOT EXISTS destination_warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS remittance_warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS remitted_by_id uuid,
  ADD COLUMN IF NOT EXISTS remitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE return_items
  ADD COLUMN IF NOT EXISTS returned_value numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid,
  ADD COLUMN IF NOT EXISTS replacement_stock_unit_id uuid,
  ADD COLUMN IF NOT EXISTS replacement_variant_id uuid,
  ADD COLUMN IF NOT EXISTS replacement_price numeric(14,2);

DO $$ BEGIN
  ALTER TABLE returns ADD CONSTRAINT fk_returns_settlement_bank
    FOREIGN KEY (settlement_bank_id) REFERENCES banks(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE returns ADD CONSTRAINT fk_returns_received_by
    FOREIGN KEY (received_by_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE returns ADD CONSTRAINT fk_returns_destination_warehouse
    FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE returns ADD CONSTRAINT fk_returns_remittance_warehouse
    FOREIGN KEY (remittance_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE returns ADD CONSTRAINT fk_returns_remitted_by
    FOREIGN KEY (remitted_by_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE return_items ADD CONSTRAINT fk_return_items_stock_unit
    FOREIGN KEY (stock_unit_id) REFERENCES stock_units(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE return_items ADD CONSTRAINT fk_return_items_replacement_stock_unit
    FOREIGN KEY (replacement_stock_unit_id) REFERENCES stock_units(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE return_items ADD CONSTRAINT fk_return_items_replacement_variant
    FOREIGN KEY (replacement_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_return_items_sale_physical_once
  ON return_items(sale_item_id, stock_unit_id)
  WHERE stock_unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_return_items_return_replacement_once
  ON return_items(return_id, replacement_stock_unit_id)
  WHERE replacement_stock_unit_id IS NOT NULL;

COMMIT;
`,
  },
  {
    name: 'prod-internal-requests.sql',
    title: 'Solicitudes internas entre bodegas',
    sql: `
CREATE TABLE IF NOT EXISTS internal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid,
  request_number varchar NOT NULL, status varchar NOT NULL DEFAULT 'CREATED',
  destination_warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  source_warehouse_id uuid REFERENCES warehouses(id) ON DELETE RESTRICT,
  notes text, created_by uuid, prepared_by uuid, prepared_at timestamptz,
  remitted_at timestamptz, closed_at timestamptz, printed_at timestamptz,
  print_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS internal_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid,
  request_id uuid NOT NULL REFERENCES internal_requests(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  requested_quantity integer NOT NULL, prepared_quantity integer NOT NULL DEFAULT 0,
  remitted_quantity integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS internal_request_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid,
  request_item_id uuid NOT NULL REFERENCES internal_request_items(id) ON DELETE CASCADE,
  stock_unit_id uuid NOT NULL REFERENCES stock_units(id) ON DELETE RESTRICT,
  transfer_id uuid REFERENCES stock_transfers(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS internal_request_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid,
  request_id uuid NOT NULL REFERENCES internal_requests(id) ON DELETE CASCADE,
  request_item_id uuid NOT NULL REFERENCES internal_request_items(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE RESTRICT,
  quantity integer NOT NULL, received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_internal_requests_tenant_number" ON internal_requests(tenant_id, request_number);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_internal_request_item_variant" ON internal_request_items(request_id, variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_internal_request_unit" ON internal_request_units(request_item_id, stock_unit_id);
CREATE INDEX IF NOT EXISTS "IDX_internal_requests_queue" ON internal_requests(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS "IDX_internal_requests_warehouses" ON internal_requests(tenant_id, destination_warehouse_id, source_warehouse_id);
`,
  },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const step of this.steps) {
      await queryRunner.query(step.sql);
    }
  }

  /**
   * Sin vuelta atrás **a propósito**: revertir esto es borrar las tablas de
   * media aplicación (permisos, conteos, devoluciones físicas, calle) con sus
   * datos. Si hay que deshacer algo, se hace con una migración nueva que diga
   * exactamente qué.
   */
  public down(): Promise<void> {
    return Promise.resolve();
  }
}
