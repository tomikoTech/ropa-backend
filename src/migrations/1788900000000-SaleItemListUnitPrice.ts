import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `list_unit_price` en `sale_items`: precio de lista (catálogo) al momento de la
 * venta, como snapshot —igual que el costo—. Permite mostrar en la factura el
 * "descuento incluido" (lista − cobrado) aunque se haya vendido a un precio fijo
 * negociado. Nulable: ventas viejas quedan sin él (no se calcula descuento, que
 * es justo lo pedido: si no hay precio de lista, no se hace).
 */
export class SaleItemListUnitPrice1788900000000 implements MigrationInterface {
  name = 'SaleItemListUnitPrice1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "list_unit_price" numeric(12,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "list_unit_price"`,
    );
  }
}
