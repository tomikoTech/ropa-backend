import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La línea de venta guarda el código con el que se identifica la mercancía.
 *
 * «El zapato, tanto físico como dentro del sistema, trae un código; siempre que
 * se haga un movimiento, mostrar el nombre pero también el código». Una venta
 * es un movimiento, y la línea solo guardaba el SKU de la variante: faltaba la
 * **referencia** —la que va impresa en la caja y la que usa la gente para
 * hablar— y el código de barras que lee el escáner.
 *
 * Van como snapshot y no por relación, igual que `product_name` y
 * `variant_sku`: si mañana se renumera una referencia, la factura de ayer debe
 * seguir diciendo con qué código se vendió.
 *
 * A las ventas que ya existen se les copia el código de hoy. No es el histórico
 * exacto —no lo tenemos— pero es infinitamente mejor que dejarlo vacío: en la
 * práctica esas referencias no se han renumerado.
 */
export class SaleItemProductCodes1787000400000 implements MigrationInterface {
  name = 'SaleItemProductCodes1787000400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "product_code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "variant_barcode" character varying`,
    );
    await queryRunner.query(`
      UPDATE "sale_items" AS si
      SET "product_code" = p."sku_prefix",
          "variant_barcode" = pv."barcode"
      FROM "product_variants" AS pv
      JOIN "products" AS p ON p."id" = pv."product_id"
      WHERE si."variant_id" = pv."id" AND si."product_code" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "variant_barcode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "product_code"`,
    );
  }
}
