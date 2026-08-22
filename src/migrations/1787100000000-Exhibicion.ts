import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Exhibición: saber qué está en la vitrina.
 *
 * La vitrina es **una bodega marcada**, no una tabla nueva. Esa es toda la
 * decisión: en la aplicación que usa un dueño de tres locales la exhibición
 * vive en un inventario aparte, y por eso «si yo voy a hacer una venta
 * múltiple de cuatro pares y una es la exhibición, primero tengo que reportar
 * los tres y después tengo que reportar la exhibición». Siendo una bodega, la
 * cascada de la venta ya la toma en el mismo ticket.
 *
 * Todo nace apagado: sin vitrinas marcadas y con el aviso en `false`, ninguna
 * tienda nota que esto existe hasta que lo pide.
 */
export class Exhibicion1787100000000 implements MigrationInterface {
  name = 'Exhibicion1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "warehouses"
        -- Esta bodega es lo que el cliente ve desde la calle.
        ADD COLUMN IF NOT EXISTS "is_exhibition" boolean NOT NULL DEFAULT false,
        -- Y de qué local sale lo que se sube a ella. Sin esto, «falta por
        -- exhibir» no sabría a quién pedirle el par.
        ADD COLUMN IF NOT EXISTS "exhibition_of_warehouse_id" uuid
    `);

    // Solo se consultan las vitrinas, que son un puñado entre muchas bodegas.
    // Parcial para no cargar el índice con todas las demás.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_warehouses_vitrinas"
      ON "warehouses" ("tenant_id", "exhibition_of_warehouse_id")
      WHERE "is_exhibition" = true
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
        -- Cuántos pares de esta referencia van en vitrina. Nulo = lo que diga
        -- la tienda; cero = esta referencia no se exhibe (las cajas de cartón
        -- y los accesorios no van en vitrina).
        ADD COLUMN IF NOT EXISTS "exhibicion_objetivo" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "store_settings"
        ADD COLUMN IF NOT EXISTS "exhibicion_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "exhibicion_objetivo" integer NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        DROP COLUMN IF EXISTS "exhibicion_enabled",
        DROP COLUMN IF EXISTS "exhibicion_objetivo"
    `);
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "exhibicion_objetivo"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_warehouses_vitrinas"`);
    await queryRunner.query(`
      ALTER TABLE "warehouses"
        DROP COLUMN IF EXISTS "is_exhibition",
        DROP COLUMN IF EXISTS "exhibition_of_warehouse_id"
    `);
  }
}
