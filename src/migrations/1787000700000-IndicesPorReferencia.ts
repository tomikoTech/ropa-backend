import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Poder preguntar «¿qué movió este documento?» sin recorrer la tabla entera.
 *
 * Anular o editar una factura necesita dos respuestas: cuánto sigue descontado
 * por esa venta (`stock_movements` por `reference_id`) y qué bultos concretos
 * se llevó (`stock_unit_events` por `reference_id`). Ninguna de las dos tablas
 * tenía índice por ahí: `stock_movements` no declaraba ninguno y
 * `stock_unit_events` solo uno por unidad y fecha.
 *
 * Son las dos tablas que más crecen —una fila por movimiento de inventario y
 * una por cada cosa que le pasa a cada par—, y las consultas corren **dentro
 * de la transacción de la venta**, con la fila de stock bloqueada. Sin índice,
 * cada anulación en una tienda con historia hace esperar a la caja.
 *
 * `CONCURRENTLY` no se puede usar aquí: TypeORM corre las migraciones dentro de
 * una transacción. Las tablas son grandes pero el bloqueo es de segundos.
 */
export class IndicesPorReferencia1787000700000 implements MigrationInterface {
  name = 'IndicesPorReferencia1787000700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_movements_referencia"
        ON "stock_movements" ("tenant_id", "reference_type", "reference_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_unit_events_referencia"
        ON "stock_unit_events" ("tenant_id", "reference_type", "reference_id")
    `);
    // El estado del bulto se consulta por variante y bodega en cada
    // comprobación de cuadre, una vez por renglón de venta.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_units_punto"
        ON "stock_units" ("tenant_id", "variant_id", "warehouse_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_stock_units_punto"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stock_unit_events_referencia"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stock_movements_referencia"`,
    );
  }
}
