import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quien registro cada venta de tercero.
 *
 * `consignments` solo sabia de que tienda era. Con una sola tienda por dueno
 * daba igual; con varias personas naturales dentro de la misma, cada una veia
 * la plata de las otras: sus ventas, sus costos y su ganancia.
 *
 * Las filas viejas quedan sin dueno (`null`) a proposito: se registraron antes
 * de que esto existiera y nadie puede decir de quien eran. Quien administra
 * las sigue viendo; los perfiles simplificados, no —y no habia ninguno cuando
 * se escribieron—.
 */
export class DuenyoDeLaVentaDeTercero1788000000000 implements MigrationInterface {
  name = 'DuenyoDeLaVentaDeTercero1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "consignments"
        ADD COLUMN IF NOT EXISTS "user_id" uuid
    `);
    // La pregunta de la pantalla es «cuanto he vendido yo», y se hace en cada
    // carga.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_consignments_tenant_user"
        ON "consignments" ("tenant_id", "user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_consignments_tenant_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consignments" DROP COLUMN IF EXISTS "user_id"`,
    );
  }
}
