import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `credit_default_days` en `store_settings`: a cuántos días vence una venta a
 * crédito si el vendedor no elige plazo.
 *
 * Nulo por defecto —que es lo que hay hoy: el campo de fecha nace vacío y hay
 * que llenarlo—. Quien vende siempre a 90 días lo configura una vez y deja de
 * escribir la misma fecha en cada factura.
 *
 * Es solo el valor inicial: el vendedor puede cambiar la fecha por venta.
 */
export class PlazoDeCreditoPorDefecto1789200000000
  implements MigrationInterface
{
  name = 'PlazoDeCreditoPorDefecto1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "credit_default_days" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "credit_default_days"`,
    );
  }
}
