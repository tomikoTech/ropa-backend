import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Necesito que lo de la bodega de locales solo lo veamos nosotros» (Andrea,
 * Distri Amber, 2026-10-27). Una bodega «solo nosotros» no se ofrece en la
 * página web ni la toma la cascada de otra bodega. Ver `bodega-privada.ts`.
 */
export class BodegaPrivada1790800000000 implements MigrationInterface {
  name = 'BodegaPrivada1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "is_private" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouses" DROP COLUMN IF EXISTS "is_private"`,
    );
  }
}
