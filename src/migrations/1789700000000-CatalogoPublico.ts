import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El catálogo público: lo tienen todas las tiendas, prendido de nacimiento.
 *
 * Es distinto de `is_storefront_active` (la tienda en línea completa, que
 * casi nadie prendió): el catálogo es ver, armar carrito y pedir, dentro de
 * la misma app. Se puede apagar por tienda desde Tienda online.
 */
export class CatalogoPublico1789700000000 implements MigrationInterface {
  name = 'CatalogoPublico1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "catalogo_enabled" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "catalogo_enabled"`,
    );
  }
}
