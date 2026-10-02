import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Qué clase de negocio es cada tienda.
 *
 * MiPinta hablaba en pares y tallas para todo el mundo; Distri Amber vende
 * lociones. La columna deja que la tienda lo diga una vez y que el resto
 * —vocabulario, pantallas, qué se enseña al vender— salga de ahí
 * (`src/tienda/perfil-del-negocio.ts`).
 *
 * Todas nacen `calzado`, que es lo que eran. La única con Producción
 * encendida era la perfumería, y se marca como tal; a esa, además, se le
 * apaga el inventario por cajas: una loción no se etiqueta par por par.
 */
export class TipoDeNegocio1790200000000 implements MigrationInterface {
  name = 'TipoDeNegocio1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        ADD COLUMN IF NOT EXISTS "tipo_de_negocio" varchar(20) NOT NULL DEFAULT 'calzado'
    `);
    await queryRunner.query(`
      UPDATE "store_settings"
         SET "tipo_de_negocio" = 'perfumeria', "unit_tracking_enabled" = false
       WHERE "production_enabled" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "tipo_de_negocio"
    `);
  }
}
