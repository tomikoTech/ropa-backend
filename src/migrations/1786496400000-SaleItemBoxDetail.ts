import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La línea de venta guarda qué caja se vendió y con qué surtido.
 *
 * Hasta ahora, vender una caja copiaba en la línea la talla de la **variante
 * equivalente** —la primera del producto—, porque el inventario agregado
 * necesita una variante para poder descontar. Efecto: una caja surtida 36-39
 * quedaba registrada como «talla 36», el detalle de la venta mostraba
 * «36 / Negro» y la factura impresa decía «Tenis Runner × 24» sin una palabra
 * del surtido.
 *
 * `box_contents` guarda lo que de verdad se entregó y `unit_kind` distingue
 * una caja de un producto suelto sin tener que ir a mirar el bulto —que para
 * entonces ya se abrió, se trasladó o cambió de estado—.
 */
export class SaleItemBoxDetail1786496400000 implements MigrationInterface {
  name = 'SaleItemBoxDetail1786496400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "unit_kind" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "box_contents" jsonb`,
    );
    // Las ventas de bultos que ya existen sí saben si fueron caja o par: el
    // dato está en el propio bulto y no cambia con el tiempo.
    await queryRunner.query(`
      UPDATE "sale_items" AS si
      SET "unit_kind" = su."kind"
      FROM "stock_units" AS su
      WHERE si."stock_unit_id" = su."id" AND si."unit_kind" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "box_contents"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "unit_kind"`,
    );
  }
}
