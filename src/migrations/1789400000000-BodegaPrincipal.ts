import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `warehouses.is_main`: cuál es **la bodega principal** de la tienda.
 *
 * Hace falta para la cesión: «que la bodega principal le preste a otra bodega u
 * otro local». Sin saber cuál es, el formulario no puede proponer el origen ni
 * el reporte puede decir «qué me deben las demás».
 *
 * **Una sola por tienda, y lo garantiza un índice**, no una convención. Dos
 * principales no es un detalle cosmético: es que el préstamo entre locales
 * deja de tener un centro y nadie sabe contra quién se cuadra.
 *
 * A las tiendas que solo tienen una bodega se les marca esa: es la respuesta
 * obvia y ahorra una pregunta. A las demás no se les adivina.
 */
export class BodegaPrincipal1789400000000 implements MigrationInterface {
  name = 'BodegaPrincipal1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "is_main" boolean NOT NULL DEFAULT false`,
    );
    // Índice parcial: la unicidad solo aplica a las marcadas. Sin el `WHERE`,
    // no se podría tener más de una bodega no-principal por tienda.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_warehouses_una_principal"
         ON "warehouses" ("tenant_id") WHERE "is_main"`,
    );
    // La tienda que solo tiene una bodega: esa es la principal.
    await queryRunner.query(
      `UPDATE "warehouses" w SET "is_main" = true
        WHERE w."is_active"
          AND (SELECT count(*) FROM "warehouses" o
                WHERE o."tenant_id" = w."tenant_id" AND o."is_active") = 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_warehouses_una_principal"`);
    await queryRunner.query(
      `ALTER TABLE "warehouses" DROP COLUMN IF EXISTS "is_main"`,
    );
  }
}
