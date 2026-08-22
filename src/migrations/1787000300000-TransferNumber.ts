import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El traslado tiene un número que una persona puede decir en voz alta.
 *
 * En el sistema anterior cada remisión es «RC-2277», y así es como la gente
 * habla de ellas: por teléfono, en el papel que viaja con la mercancía, en el
 * grupo de WhatsApp. Aquí solo existía el uuid, que no sirve para nada de eso
 * —y que la pantalla, con razón, nunca mostró—.
 *
 * A las remisiones que ya existen se les asigna el número por orden de
 * creación, para que el consecutivo tenga sentido hacia atrás.
 */
export class TransferNumber1787000300000 implements MigrationInterface {
  name = 'TransferNumber1787000300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "transfer_number" character varying`,
    );
    // Numera lo que ya está, por tenant y por antigüedad.
    await queryRunner.query(`
      UPDATE "stock_transfers" AS st
      SET "transfer_number" = 'TR-' || lpad(orden.fila::text, 5, '0')
      FROM (
        SELECT id, row_number() OVER (
          PARTITION BY tenant_id ORDER BY created_at, id
        ) AS fila
        FROM "stock_transfers"
      ) AS orden
      WHERE st.id = orden.id AND st."transfer_number" IS NULL
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_stock_transfers_tenant_number"
       ON "stock_transfers" ("tenant_id", "transfer_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_stock_transfers_tenant_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "transfer_number"`,
    );
  }
}
