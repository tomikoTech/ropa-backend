import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El índice por venta en los renglones de la factura.
 *
 * `sale_items` tenía índice por `tenant_id`, por impulsador y por bulto, pero
 * **no por `sale_id`** —que es por donde se lee y se borra cada vez que se
 * abre o se edita una factura—. El plan de consulta lo decía sin rodeos:
 *
 *     explain select * from sale_items where sale_id = '…'
 *     Seq Scan on sale_items
 *
 * Hoy no duele porque la tabla es pequeña, pero crece con cada venta de cada
 * tienda y nunca se poda. Editar una factura corre **dentro** de la
 * transacción de la venta, con la fila de stock bloqueada: cuando empiece a
 * doler, lo que se ve es la caja esperando.
 *
 * `CONCURRENTLY` no se puede usar acá porque las migraciones corren dentro de
 * una transacción. Con el tamaño actual el bloqueo es de milisegundos; si esta
 * migración llegara tarde a una tabla ya grande, conviene crear el índice a
 * mano y marcarla como aplicada.
 */
export class IndiceSaleItemsPorVenta1787300000000 implements MigrationInterface {
  name = 'IndiceSaleItemsPorVenta1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sale_items_sale"
        ON "sale_items" ("sale_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sale_items_sale"`);
  }
}
