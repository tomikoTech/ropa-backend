import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pagarle a un proveedor varias facturas de una sola vez.
 *
 * Cobrar ya se podía así desde hace rato —`accounts_receivable_payments` tiene
 * `allocation_batch_id` desde entonces—, pero pagar seguía siendo factura por
 * factura. Estas tres columnas ponen a `accounts_payable_payments` a la altura
 * de su gemela:
 *
 *  - `allocation_batch_id`: qué renglones salieron del **mismo** pago. Sin
 *    esto, un pago repartido entre cuatro facturas se ve como cuatro pagos sin
 *    relación y no hay forma de auditarlo junto ni de deshacerlo entero.
 *  - `bank_id`: de qué cuenta salió la plata. Tesorería ya lo pregunta en todo
 *    lo demás.
 *  - `user_id`: quién pagó.
 *
 * Las tres nulas: las filas viejas no saben nada de esto y no se inventa.
 */
export class AbonoRepartidoAProveedores1789300000000
  implements MigrationInterface
{
  name = 'AbonoRepartidoAProveedores1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts_payable_payments" ADD COLUMN IF NOT EXISTS "allocation_batch_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts_payable_payments" ADD COLUMN IF NOT EXISTS "bank_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts_payable_payments" ADD COLUMN IF NOT EXISTS "user_id" uuid`,
    );
    // Se consulta siempre por lote: «muéstrame el pago completo», no un renglón
    // suelto. Sin índice eso recorre la tabla entera de abonos.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ap_payments_allocation_batch" ON "accounts_payable_payments" ("allocation_batch_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ap_payments_allocation_batch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts_payable_payments" DROP COLUMN IF EXISTS "user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts_payable_payments" DROP COLUMN IF EXISTS "bank_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts_payable_payments" DROP COLUMN IF EXISTS "allocation_batch_id"`,
    );
  }
}
