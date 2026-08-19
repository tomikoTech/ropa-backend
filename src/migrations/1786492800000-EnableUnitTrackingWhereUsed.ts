import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enciende el inventario por cajas en las tiendas que ya lo usan.
 *
 * `store_settings.unit_tracking_enabled` existía desde que se construyó el
 * inventario por bultos, pero **ningún código lo leía**: la función estaba
 * visible para todo el mundo, incluida una perfumería que vende por unidad
 * suelta y no tiene cajas.
 *
 * Ahora el interruptor sí manda, y por eso hay que dejarlo prendido donde ya
 * hay mercancía etiquetada o compras por caja. Si se dejara en `false` para
 * todos, una tienda que hoy trabaja con cajas abriría el sistema y no
 * encontraría su inventario.
 */
export class EnableUnitTrackingWhereUsed1786492800000
  implements MigrationInterface
{
  name = 'EnableUnitTrackingWhereUsed1786492800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "store_settings"
      SET "unit_tracking_enabled" = true
      WHERE "unit_tracking_enabled" = false
        AND (
          "tenant_id" IN (SELECT DISTINCT "tenant_id" FROM "stock_units")
          OR "tenant_id" IN (SELECT DISTINCT "tenant_id" FROM "purchase_box_lines")
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se apaga de vuelta: no hay forma de distinguir las tiendas que
    // encendió esta migración de las que lo activaron después a mano, y
    // apagarlas a todas les escondería su propio inventario.
  }
}
