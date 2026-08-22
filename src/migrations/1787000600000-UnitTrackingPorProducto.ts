import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `products.unit_tracking` empieza a decir la verdad.
 *
 * La columna existía desde el principio y **nunca se leía**: el único control
 * real era un `if` en la recepción de cajas, sobre el ajuste de la tienda. Así
 * que nada impedía que un producto con pares etiquetados pasara por los caminos
 * que solo tocan el agregado —vender desde el buscador, recibir una compra,
 * trasladar, ajustar— y dejara los códigos atrás. En una tienda el desvío llegó
 * a 866 unidades contra 512 etiquetadas.
 *
 * Ahora es el campo que decide si una operación tiene que mover también los
 * bultos. Para que decida bien hay que ponerlo donde corresponde: encendido en
 * las tiendas que trabajan con códigos por par, apagado en las que no.
 *
 * El criterio es el ajuste de la tienda (`unit_tracking_enabled`), que es lo
 * que ya distinguía a una importadora de calzado de una perfumería.
 */
export class UnitTrackingPorProducto1787000600000 implements MigrationInterface {
  name = 'UnitTrackingPorProducto1787000600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products" AS p
      SET "unit_tracking" = true
      FROM "store_settings" AS ss
      WHERE ss."tenant_id" = p."tenant_id"
        AND ss."unit_tracking_enabled" = true
        AND p."unit_tracking" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Se apaga solo donde lo encendió esta migración: un producto que ya venía
    // marcado a mano no tiene por qué perderlo.
    await queryRunner.query(`
      UPDATE "products" AS p
      SET "unit_tracking" = false
      FROM "store_settings" AS ss
      WHERE ss."tenant_id" = p."tenant_id"
        AND ss."unit_tracking_enabled" = true
    `);
  }
}
