import { MigrationInterface, QueryRunner } from 'typeorm';

// F5 — Cotizaciones: tablas quotations + quotation_items y flag por tenant.
// Idempotente (IF NOT EXISTS) para poder correrla sobre bases ya sincronizadas.
export class Quotations1785900000000 implements MigrationInterface {
  name = 'Quotations1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quotations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "quote_number" character varying NOT NULL,
        "client_id" uuid,
        "warehouse_id" uuid NOT NULL,
        "subtotal" numeric(14,2) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "tax_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "total" numeric(14,2) NOT NULL DEFAULT 0,
        "status" character varying NOT NULL DEFAULT 'DRAFT',
        "notes" text,
        "expires_at" timestamptz,
        "converted_sale_id" uuid,
        "created_by" uuid,
        "tenant_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quotations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quotations_tenant" ON "quotations" ("tenant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quotation_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "quotation_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "product_name" character varying NOT NULL,
        "variant_sku" character varying NOT NULL,
        "variant_size" character varying NOT NULL,
        "variant_color" character varying NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price" numeric(12,2) NOT NULL,
        "discount_percent" numeric(5,2) NOT NULL DEFAULT 0,
        "tax_rate" numeric(5,2) NOT NULL DEFAULT 19,
        "line_total" numeric(14,2) NOT NULL,
        "tenant_id" uuid,
        CONSTRAINT "PK_quotation_items" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quotation_items_tenant" ON "quotation_items" ("tenant_id")`,
    );
    // FK a quotations (borra ítems al borrar la cotización).
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_quotation_items_quotation'
        ) THEN
          ALTER TABLE "quotation_items"
            ADD CONSTRAINT "FK_quotation_items_quotation"
            FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Flag por tenant.
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "quotations_enabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "quotations_enabled"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "quotation_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotations"`);
  }
}
