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
