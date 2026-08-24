import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Devuelve el seguimiento por par a los productos que lo perdieron sin querer.
 *
 * `products.unit_tracking` tiene tres estados desde `CodigoPorParPorDefecto`:
 * `true` sí, `false` **no aunque la tienda diga que sí**, `null` lo que diga la
 * tienda. El formulario de productos nunca se enteró: nacía apagado y mandaba
 * un `false` explícito, así que **todo producto creado desde la pantalla
 * después de esa migración quedó diciendo «no me etiquetes»**.
 *
 * El daño no se ve al crear ni al recibir —esos caminos crean los códigos
 * igual— sino al **vender**: el par no se marca como vendido, se queda
 * disponible y se puede volver a facturar. El agregado sí baja, así que las
 * dos cuentas se separan en silencio. Se comprobó en el recorrido del 23 de
 * agosto: un par vendido se volvió a escanear y entró al carrito.
 *
 * **A quién toca, y solo a esos:** productos con `false` que **tienen bultos
 * creados**. Tener etiquetas y decir que no se etiqueta es la contradicción
 * que prueba el error; sin bultos, un `false` puede ser una decisión legítima
 * de alguien.
 *
 * **A quién no toca:** las esencias y los frascos, que `CodigoPorParPorDefecto`
 * puso en `false` **a propósito** —se miden en gramos y una etiqueta por gramo
 * no significa nada—. Se excluyen por su categoría aunque tengan bultos.
 *
 * Quedan en `null`, no en `true`: «lo que diga la tienda» es la respuesta
 * honesta para un producto que nunca opinó, y deja que el interruptor de la
 * tienda siga sirviendo para lo que existe.
 */
export class SeguimientoPorParPerdido1787500000000
  implements MigrationInterface
{
  name = 'SeguimientoPorParPerdido1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products" p
      SET "unit_tracking" = NULL
      WHERE p."unit_tracking" = false
        AND EXISTS (
          SELECT 1 FROM "stock_units" su
           WHERE su."product_id" = p."id"
             AND su."tenant_id" = p."tenant_id"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "categories" c
           WHERE c."id" = p."category_id"
             AND c."type" IN ('ESSENCE', 'FRASCO')
        )
    `);
  }

  public async down(): Promise<void> {
    // No se revierte. Volver a poner `false` reabriría el defecto —pares que
    // se pueden vender dos veces— y no hay forma de distinguir los que esta
    // migración cambió de los que ya estaban en `null`.
  }
}
