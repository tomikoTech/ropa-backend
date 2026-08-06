import { MigrationInterface, QueryRunner } from 'typeorm';

// F2 — Puntas + comisiones: config por tenant, override por producto y snapshot
// en sale_items. Idempotente.
export class LeftoverCommissions1785900300000 implements MigrationInterface {
  name = 'LeftoverCommissions1785900300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Config por tenant.
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "leftover_age_months" integer NOT NULL DEFAULT 8`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "leftover_max_sizes" integer NOT NULL DEFAULT 2`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "leftover_commission_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "leftover_commission_mode" character varying NOT NULL DEFAULT 'fixed'`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "leftover_commission_value" numeric(12,2) NOT NULL DEFAULT 0`,
    );

    // Override manual por producto.
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_leftover" boolean`,
    );

    // Snapshot en la venta.
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "is_leftover" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "commission_amount" numeric(12,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "commission_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "is_leftover"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "is_leftover"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "leftover_commission_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "leftover_commission_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "leftover_commission_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "leftover_max_sizes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "leftover_age_months"`,
    );
  }
}
