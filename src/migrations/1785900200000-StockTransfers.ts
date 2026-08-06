import { MigrationInterface, QueryRunner } from 'typeorm';

// F3+F4 — Remisiones (traslado con confirmación) y préstamos: tabla
// stock_transfers + flags por tenant. Idempotente.
export class StockTransfers1785900200000 implements MigrationInterface {
  name = 'StockTransfers1785900200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_transfers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" character varying NOT NULL DEFAULT 'TRANSFER',
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "variant_id" uuid NOT NULL,
        "from_warehouse_id" uuid NOT NULL,
        "to_warehouse_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "notes" text,
        "created_by" uuid,
        "received_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "received_at" timestamptz,
        "tenant_id" uuid,
        CONSTRAINT "PK_stock_transfers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stock_transfers_tenant" ON "stock_transfers" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stock_transfers_variant" ON "stock_transfers" ("variant_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "transfer_confirmation_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "quick_loan_enabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "quick_loan_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "transfer_confirmation_enabled"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_transfers"`);
  }
}
