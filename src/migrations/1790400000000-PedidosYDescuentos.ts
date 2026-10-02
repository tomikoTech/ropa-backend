import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2 para Distri Amber:
 *  - `ecommerce_orders.sale_id`: el pedido aceptado queda enlazado a su venta.
 *  - `store_settings.descuentos_presets`: los porcentajes que la tienda usa
 *    (10, 15, 20, 30…), botones en el POS y al aceptar pedidos.
 *  - `clients.descuento_por_defecto`: el que se le propone a ese cliente.
 */
export class PedidosYDescuentos1790400000000 implements MigrationInterface {
  name = 'PedidosYDescuentos1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ecommerce_orders" ADD COLUMN IF NOT EXISTS "sale_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "descuentos_presets" jsonb NOT NULL DEFAULT '[10,15,20,30]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "descuento_por_defecto" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN IF EXISTS "descuento_por_defecto"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "descuentos_presets"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ecommerce_orders" DROP COLUMN IF EXISTS "sale_id"`,
    );
  }
}
