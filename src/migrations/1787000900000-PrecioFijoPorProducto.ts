import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un producto puede tener el precio cerrado.
 *
 * Ya existía `minimum_sale_price`, que es un **piso**: el vendedor puede subir
 * pero no bajar. Lo que faltaba es distinto y una tienda lo dijo con todas las
 * letras: «las cajas que yo vendo, si tienen un precio, eso no tiene descuento
 * para nadie». Ahí no hay piso ni techo: hay **un** precio.
 *
 * Apagado por defecto, porque en calzado el precio casi siempre se negocia y
 * encenderlo para todos rompería la operación de todas las tiendas que ya
 * están vendiendo.
 */
export class PrecioFijoPorProducto1787000900000 implements MigrationInterface {
  name = 'PrecioFijoPorProducto1787000900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "fixed_price" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "fixed_price"
    `);
  }
}
