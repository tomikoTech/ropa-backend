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
