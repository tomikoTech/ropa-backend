BEGIN;

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS price_difference numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_method varchar,
  ADD COLUMN IF NOT EXISTS settlement_bank_id uuid,
  ADD COLUMN IF NOT EXISTS settlement_reference varchar,
  ADD COLUMN IF NOT EXISTS received_by_id uuid,
  ADD COLUMN IF NOT EXISTS destination_warehouse_id uuid,
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
