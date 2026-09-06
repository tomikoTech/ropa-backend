import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `label_design` en `store_settings`: el diseño de la etiqueta impresa que deja
 * el panel visual (tamaño, campos, orden y espacio de cada uno), por tienda.
 * `null` = diseño de fábrica, así que no cambia nada para quien no lo toque.
 */
export class DisenoDeEtiqueta1789000000000 implements MigrationInterface {
  name = 'DisenoDeEtiqueta1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "label_design" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "label_design"`,
    );
  }
}
