import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El despacho de calle guarda el código de barras de lo que salió.
 *
 * El patinador se lleva la mercancía y el papel; al volver se cuadra por
 * código, no por el nombre del producto. Va como snapshot —igual que
 * `variant_sku`— para que un despacho viejo siga diciendo con qué código salió
 * aunque la referencia se haya renumerado después.
 */
export class StreetDispatchItemBarcode1787000500000
  implements MigrationInterface
{
  name = 'StreetDispatchItemBarcode1787000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "street_dispatch_items" ADD COLUMN IF NOT EXISTS "variant_barcode" character varying`,
    );
    // A los despachos que ya existen se les copia el código de hoy: no es el
    // histórico exacto, pero en la práctica esas referencias no se renumeran y
    // es mucho mejor que dejarlo vacío.
    await queryRunner.query(`
      UPDATE "street_dispatch_items" AS sdi
      SET "variant_barcode" = pv."barcode"
      FROM "product_variants" AS pv
      WHERE sdi."variant_id" = pv."id" AND sdi."variant_barcode" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "street_dispatch_items" DROP COLUMN IF EXISTS "variant_barcode"`,
    );
  }
}
