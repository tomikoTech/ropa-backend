import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «¿Cómo los locales de nosotros pueden hacer los pedidos por la página?»
 * (Andrea, Distri Amber, 2026-10-27). La bodega «solo nosotros» tiene su
 * enlace privado del catálogo. Las que ya estaban marcadas reciben el suyo.
 */
export class EnlaceDeBodegaPrivada1790900000000 implements MigrationInterface {
  name = 'EnlaceDeBodegaPrivada1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "codigo_web" varchar(32)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_warehouses_codigo_web" ON "warehouses" ("codigo_web") WHERE "codigo_web" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "warehouses" SET "codigo_web" = substr(md5(random()::text || id::text), 1, 12)
       WHERE "is_private" AND "codigo_web" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_warehouses_codigo_web"`);
    await queryRunner.query(
      `ALTER TABLE "warehouses" DROP COLUMN IF EXISTS "codigo_web"`,
    );
  }
}
