import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un pago a proveedor se puede deshacer, igual que un abono de cliente.
 *
 * El pago mal digitado —el monto con un cero de más, la factura equivocada—
 * no tenía arreglo: no había botón ni endpoint, y el saldo del proveedor
 * quedaba mal para siempre. Se compensa con un renglón en negativo que apunta
 * al original, como en `ContraAbono`: los dos quedan a la vista y el día en
 * que salió la plata no se reescribe.
 */
export class ContraPagoAProveedor1790100000000 implements MigrationInterface {
  name = 'ContraPagoAProveedor1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounts_payable_payments"
        ADD COLUMN IF NOT EXISTS "reverses_payment_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_app_reverses_payment"
        ON "accounts_payable_payments" ("reverses_payment_id")
        WHERE "reverses_payment_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_app_reverses_payment"`);
    await queryRunner.query(`
      ALTER TABLE "accounts_payable_payments"
        DROP COLUMN IF EXISTS "reverses_payment_id"
    `);
  }
}
