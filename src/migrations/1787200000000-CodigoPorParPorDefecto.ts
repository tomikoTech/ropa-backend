import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El código por par deja de ser la excepción.
 *
 * `store_settings.unit_tracking_enabled` nacía **apagado**, y el resultado era
 * que casi ninguna tienda tenía el código único por par: en el POS, dos líneas
 * de la misma referencia mostraban el mismo número —el de la variante, que es
 * igual para todos los pares de esa talla— y no había forma de saber cuál par
 * era cuál. Quien tiene los códigos impresos en la caja y escanea con pistola
 * no podía verificar nada contra la pantalla.
 *
 * No era un problema de pantalla: el código **no existía en la base**. Con el
 * interruptor apagado, `StockLedger` nunca crea la etiqueta cuando entra
 * mercancía, así que no había nada que mostrar.
 *
 * Esta migración hace tres cosas:
 *
 * 1. **Abre el tercer estado en `products.unit_tracking`.** Antes la regla era
 *    `producto OR tienda`, así que un producto no podía decir que no. Ahora
 *    `null` significa «lo que diga la tienda» y `false` significa «no, aunque
 *    la tienda diga que sí». Los `false` de antes se convierten en `null`
 *    porque es exactamente como se comportaban: es un cambio de
 *    representación, no de conducta.
 *
 * 2. **Deja fuera lo que se mide en gramos.** Una esencia de perfumería con
 *    cinco kilos en bodega habría recibido cinco mil etiquetas en una sola
 *    transacción. Las categorías `ESSENCE` y `FRASCO` quedan en `false`
 *    explícito: un líquido no tiene un par que etiquetar. Cualquiera puede
 *    cambiarlo después producto por producto.
 *
 * 3. **Enciende el interruptor en todas las tiendas** y cambia el valor por
 *    defecto, para que una tienda nueva nazca encendida.
 *
 * Lo que **no** hace: crear etiquetas para la mercancía que ya está en bodega.
 * Eso se decide tienda por tienda, porque los códigos que inventa el sistema
 * no coinciden con lo que hoy está impreso en las cajas. Para eso están
 * `importar:codigos-fisicos` (traer los de demachine, que sí son los impresos)
 * y `reconciliar:bultos` (crear los que falten).
 */
export class CodigoPorParPorDefecto1787200000000 implements MigrationInterface {
  name = 'CodigoPorParPorDefecto1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tercer estado. El orden importa: primero se permite el nulo, después
    //    se convierten los `false`, y solo entonces se quita el default viejo.
    await queryRunner.query(`
      ALTER TABLE "products"
        ALTER COLUMN "unit_tracking" DROP NOT NULL,
        ALTER COLUMN "unit_tracking" DROP DEFAULT
    `);
    await queryRunner.query(`
      UPDATE "products"
      SET "unit_tracking" = NULL
      WHERE "unit_tracking" = false
    `);

    // 2. Lo que se mide en gramos se queda fuera, y dicho explícitamente.
    await queryRunner.query(`
      UPDATE "products" p
      SET "unit_tracking" = false
      FROM "categories" c
      WHERE c."id" = p."category_id"
        AND c."type" IN ('ESSENCE', 'FRASCO')
        AND p."unit_tracking" IS DISTINCT FROM false
    `);

    // 3. Encendido en todas, y encendido de nacimiento.
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        ALTER COLUMN "unit_tracking_enabled" SET DEFAULT true
    `);
    await queryRunner.query(`
      UPDATE "store_settings"
      SET "unit_tracking_enabled" = true
      WHERE "unit_tracking_enabled" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El interruptor vuelve a nacer apagado, pero **no se apaga en las tiendas
    // que ya lo tienen encendido**: no hay forma de distinguir las que encendió
    // esta migración de las que lo activaron a mano, y apagarlas a todas les
    // escondería su propio inventario etiquetado. Es el mismo criterio que
    // `EnableUnitTrackingWhereUsed`.
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        ALTER COLUMN "unit_tracking_enabled" SET DEFAULT false
    `);

    // El tercer estado sí se cierra: `null` vuelve a ser `false`, que es como
    // se comportaba antes gracias al `OR`. Se pierde la distinción entre «no,
    // aunque la tienda diga que sí» y «lo que diga la tienda», que es
    // justamente la que no existía.
    await queryRunner.query(`
      UPDATE "products"
      SET "unit_tracking" = false
      WHERE "unit_tracking" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
        ALTER COLUMN "unit_tracking" SET DEFAULT false,
        ALTER COLUMN "unit_tracking" SET NOT NULL
    `);
  }
}
