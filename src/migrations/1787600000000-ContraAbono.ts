import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un abono de cartera se puede deshacer.
 *
 * Anular una venta a crédito con abonos se rechaza a propósito y el mensaje
 * pide «reversa los abonos antes de anularla». Reversar un abono **no
 * existía**: ni botón ni endpoint. Una venta a crédito ya abonada quedaba
 * imposible de anular para siempre, y el caso es corriente —el cliente abona y
 * después devuelve la mercancía—.
 *
 * No se borra: se compensa con un renglón en negativo que apunta al original.
 * Los dos quedan a la vista y el cuadre de cada día sigue cuadrando con lo que
 * de verdad pasó ese día.
 */
export class ContraAbono1787600000000 implements MigrationInterface {
  name = 'ContraAbono1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounts_receivable_payments"
        ADD COLUMN IF NOT EXISTS "reverses_payment_id" uuid
    `);
    // Índice para la pregunta que se hace en cada pantalla de cartera:
    // «¿este abono ya está reversado?».
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arp_reverses_payment"
        ON "accounts_receivable_payments" ("reverses_payment_id")
        WHERE "reverses_payment_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_arp_reverses_payment"`);
    await queryRunner.query(`
      ALTER TABLE "accounts_receivable_payments"
        DROP COLUMN IF EXISTS "reverses_payment_id"
    `);
  }
}
