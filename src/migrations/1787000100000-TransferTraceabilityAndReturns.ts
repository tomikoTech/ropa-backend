import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El traslado cuenta su historia completa y sabe devolverse.
 *
 * Faltaban dos cosas que la operación pedía a gritos:
 *
 * 1. **Quién y por qué.** La remisión guardaba quién la creó y quién la
 *    recibió, pero no quién la rechazó ni con qué motivo, y «cancelada» tapaba
 *    dos cosas distintas: que el origen se arrepintió o que el destino no la
 *    quiso recibir. Al revisar el historial había que preguntar por WhatsApp.
 *
 * 2. **La vuelta.** «Hicimos el traslado pero no se vendió el zapato»: una
 *    remisión ya recibida no tenía camino de regreso. Lo que se hacía era un
 *    traslado nuevo en sentido contrario, suelto, sin vínculo con el original,
 *    así que nadie podía ver que esos pares eran los mismos que fueron.
 *
 * `return_of_transfer_id` ata la devolución a su traslado y `returned_quantity`
 * permite que vuelva solo una parte —que es el caso real: se mandaron seis,
 * se vendieron cuatro, regresan dos—.
 */
export class TransferTraceabilityAndReturns1787000100000
  implements MigrationInterface
{
  name = 'TransferTraceabilityAndReturns1787000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "closed_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "closed_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "return_of_transfer_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "returned_quantity" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_transfers_return_of" ON "stock_transfers" ("return_of_transfer_id")`,
    );
    // El historial se lee casi siempre por tienda y por fecha.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_transfers_tenant_created" ON "stock_transfers" ("tenant_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stock_transfers_tenant_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stock_transfers_return_of"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "returned_quantity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "return_of_transfer_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "closed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "closed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "reason"`,
    );
  }
}
