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
