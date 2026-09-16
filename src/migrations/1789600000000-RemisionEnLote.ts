import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una remisión con varios renglones.
 *
 * El traslado era de una talla por vez: mandar tres cajas y cinco pares al
 * otro local eran ocho remisiones. Cada renglón sigue siendo una fila —se
 * recibe y se devuelve por renglón— y el `lote_id` dice cuáles viajaron
 * juntos. Los números de los renglones llevan sufijo («TR-00042-1»), así que
 * el índice único sobre `transfer_number` sigue valiendo tal cual.
 */
export class RemisionEnLote1789600000000 implements MigrationInterface {
  name = 'RemisionEnLote1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "lote_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stock_transfers_lote"
         ON "stock_transfers" ("lote_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_transfers_lote"`);
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "lote_id"`,
    );
  }
}
