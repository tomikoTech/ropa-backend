import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `order_name` en `purchase_orders`: cómo llama la tienda a ese pedido
 * («PROMO WIMFLO»). Es lo que va rotulado en la etiqueta de la caja; el
 * consecutivo sirve para buscarlo, pero en bodega nadie lo usa.
 *
 * Opcional: sin nombre, la etiqueta sigue mostrando el número, como hasta hoy.
 */
export class NombreDelPedido1789100000000 implements MigrationInterface {
  name = 'NombreDelPedido1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "order_name" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "order_name"`,
    );
  }
}
