import { MigrationInterface, QueryRunner } from 'typeorm';

export class FifoPaymentsAndBoxSequences1786255200000 implements MigrationInterface {
  name = 'FifoPaymentsAndBoxSequences1786255200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "ar_payment_allocation_mode" character varying(10) NOT NULL DEFAULT 'MANUAL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "show_box_pair_sequence_on_labels" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts_receivable_payments" ADD COLUMN IF NOT EXISTS "allocation_batch_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_units" ADD COLUMN IF NOT EXISTS "box_sequence" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_units" ADD COLUMN IF NOT EXISTS "pair_sequence" integer`,
    );
    // Metadato únicamente: no cambia ningún barcode. Las cajas y pares ya
    // existentes reciben una secuencia determinista dentro de su relación.
    await queryRunner.query(`
      WITH ranked_boxes AS (
        SELECT "id",
               ROW_NUMBER() OVER (
                 PARTITION BY "tenant_id", "purchase_box_line_id"
                 ORDER BY "created_at", "barcode", "id"
               )::integer AS sequence
        FROM "stock_units"
        WHERE "kind" = 'BOX'
          AND "purchase_box_line_id" IS NOT NULL
      )
      UPDATE "stock_units" unit
      SET "box_sequence" = ranked.sequence
      FROM ranked_boxes ranked
      WHERE unit."id" = ranked."id"
        AND unit."box_sequence" IS NULL
    `);
    await queryRunner.query(`
      WITH ranked_pairs AS (
        SELECT child."id",
               parent."box_sequence" AS box_sequence,
               ROW_NUMBER() OVER (
                 PARTITION BY child."tenant_id", child."parent_unit_id"
                 ORDER BY child."created_at", child."barcode", child."id"
               )::integer AS pair_sequence
        FROM "stock_units" child
        JOIN "stock_units" parent ON parent."id" = child."parent_unit_id"
        WHERE child."kind" = 'UNIT'
          AND child."parent_unit_id" IS NOT NULL
      )
      UPDATE "stock_units" unit
      SET "box_sequence" = ranked.box_sequence,
          "pair_sequence" = ranked.pair_sequence
      FROM ranked_pairs ranked
      WHERE unit."id" = ranked."id"
        AND unit."pair_sequence" IS NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ar_payments_allocation_batch" ON "accounts_receivable_payments" ("tenant_id", "allocation_batch_id") WHERE "allocation_batch_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_unit_box_sequence" ON "stock_units" ("tenant_id", "purchase_box_line_id", "box_sequence") WHERE "kind" = 'BOX' AND "box_sequence" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_unit_pair_sequence" ON "stock_units" ("tenant_id", "parent_unit_id", "pair_sequence") WHERE "kind" = 'UNIT' AND "pair_sequence" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_stock_unit_pair_sequence"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_stock_unit_box_sequence"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ar_payments_allocation_batch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_units" DROP COLUMN IF EXISTS "pair_sequence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_units" DROP COLUMN IF EXISTS "box_sequence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts_receivable_payments" DROP COLUMN IF EXISTS "allocation_batch_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "show_box_pair_sequence_on_labels"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "ar_payment_allocation_mode"`,
    );
  }
}
