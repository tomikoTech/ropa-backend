import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `invoice_show_codes` en `store_settings`: si la factura del cliente imprime el
 * código del producto bajo su nombre. Encendido por defecto (no cambia nada para
 * las tiendas actuales); Distri Amber lo apaga para que el cliente vea solo el
 * nombre del producto.
 */
export class InvoiceShowCodes1788800000000 implements MigrationInterface {
  name = 'InvoiceShowCodes1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "invoice_show_codes" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "invoice_show_codes"`,
    );
  }
}
