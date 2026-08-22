import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cada movimiento anota **qué pares** movió.
 *
 * El código que le importa a la tienda no es el de la variante —ese es el del
 * modelo y la talla, igual para todos los pares iguales— sino el que va
 * impreso en la caja de **ese** par. El sistema ya lo elegía al vender, al
 * trasladar y al recibir; simplemente no lo guardaba en ninguna parte donde se
 * pudiera leer después, así que la factura decía «2 unidades» y no había forma
 * de saber cuáles dos se llevó el cliente.
 *
 * Se guarda en el movimiento y no en la línea de la venta porque el movimiento
 * es por donde pasan **todas** las operaciones: con una columna, el historial,
 * el detalle de la factura, los traslados y la trazabilidad del inventario
 * responden la misma pregunta sin que cada uno la resuelva por su cuenta.
 */
export class MovimientoConCodigosDeBulto1787000800000 implements MigrationInterface {
  name = 'MovimientoConCodigosDeBulto1787000800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN IF NOT EXISTS "unit_barcodes" text[]
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "unit_barcodes"
    `);
  }
}
