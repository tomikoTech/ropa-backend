import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lo que necesita la producción simple de una perfumería (Fase 1):
 *
 *  - `store_settings.costo_fijo_de_esencia`: pesos de esencia por unidad
 *    terminada («mucha o poca, 7.000»).
 *  - `store_settings.mano_de_obra_por_unidad`: la general de la tienda.
 *  - `products.mano_de_obra`: la de un producto cuando no cobra igual.
 *  - `purchase_order_items.quantity_damaged`: lo que llegó malo en la
 *    recepción, que entra y se da de baja en el mismo acto.
 *
 * La regla del costo vive en `src/production/costo-del-terminado.ts`.
 */
export class CostoDelTerminado1790300000000 implements MigrationInterface {
  name = 'CostoDelTerminado1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        ADD COLUMN IF NOT EXISTS "costo_fijo_de_esencia" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "mano_de_obra_por_unidad" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "mano_de_obra" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
        ADD COLUMN IF NOT EXISTS "quantity_damaged" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items" DROP COLUMN IF EXISTS "quantity_damaged"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "mano_de_obra"`,
    );
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        DROP COLUMN IF EXISTS "costo_fijo_de_esencia",
        DROP COLUMN IF EXISTS "mano_de_obra_por_unidad"
    `);
  }
}
