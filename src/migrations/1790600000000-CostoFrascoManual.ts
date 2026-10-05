import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Costo de perfumes» (Andrea, 4 oct 2026): la página que enseña cuánto sale
 * cada perfume. Casi todo ya estaba (`mano_de_obra`, los fijos de la tienda);
 * lo único nuevo es poder escribir a mano lo que cuesta el frasco de una
 * loción cuyo frasco **nunca se ha comprado por el sistema**. En cuanto haya
 * una compra recibida, manda la compra y este valor deja de usarse.
 *
 * La regla vive en `src/production/costo-de-perfumes.ts`.
 */
export class CostoFrascoManual1790600000000 implements MigrationInterface {
  name = 'CostoFrascoManual1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "costo_frasco_manual" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "costo_frasco_manual"`,
    );
  }
}
