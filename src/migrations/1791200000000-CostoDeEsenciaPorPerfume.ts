import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Quiero poder poner el valor de los frascos al que le falte y el valor de la
 * esencia» (Andrea, Distri Amber, 2026-11-09). Cada perfume puede tener su
 * propio costo de esencia; sin él, el general de la tienda.
 */
export class CostoDeEsenciaPorPerfume1791200000000 implements MigrationInterface {
  name = 'CostoDeEsenciaPorPerfume1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "costo_esencia" int`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "costo_esencia"`,
    );
  }
}
