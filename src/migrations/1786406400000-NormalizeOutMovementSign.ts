import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deja todas las salidas guardadas en negativo.
 *
 * La misma operación quedaba escrita de dos formas: el POS registraba una
 * salida como `-8`, y compras, producción, recetas, conteos físicos, calle,
 * devoluciones y el ajuste rápido la registraban como `9`. Cada uno restaba
 * del stock por su cuenta y guardaba la cantidad tal como la había recibido,
 * así que la columna quedó con dos convenciones mezcladas.
 *
 * Eso no descuadró ningún inventario —el stock se guarda aparte y siempre se
 * calculó bien—, pero hacía ilegible el historial: la pantalla mostraba una
 * salida de 9 unidades como «+9», y sumar la columna daba cualquier cosa.
 *
 * De acá en adelante lo garantiza `@BeforeInsert` en la entidad
 * (`normalizeStoredQuantity`), así que un módulo nuevo no puede volver a
 * torcerlo. Esta migración arregla lo que quedó escrito antes.
 *
 * No toca `TRANSFER` —ahí el signo dice de qué bodega salió—, ni `ADJUSTMENT`
 * —que no es un delta sino el conteo final—, ni `IN`.
 */
export class NormalizeOutMovementSign1786406400000
  implements MigrationInterface
{
  name = 'NormalizeOutMovementSign1786406400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Solo las positivas: las que ya estaban en negativo se quedan igual, y
    // así correr esto dos veces no invierte nada.
    await queryRunner.query(`
      UPDATE "stock_movements"
      SET "quantity" = -"quantity"
      WHERE "movement_type" = 'OUT' AND "quantity" > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Se deja la convención buena. Volver a la mezcla anterior es imposible:
    // no quedó registro de cuál módulo escribió cada fila, y revertir todas
    // rompería las 156 que el POS ya guardaba bien.
  }
}
