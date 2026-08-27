import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Personalización de la etiqueta impresa (cajas y pares).
 *
 * La tienda ya podía imprimir stickers, pero salían sin su logo y con poca
 * información. Estas tres columnas dejan subir un logo propio para la etiqueta
 * (si no, se usa el logo general), mostrar el precio, y una línea libre al pie.
 */
export class PersonalizacionDeEtiqueta1788300000000
  implements MigrationInterface
{
  name = 'PersonalizacionDeEtiqueta1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        ADD COLUMN IF NOT EXISTS "label_logo_url" varchar,
        ADD COLUMN IF NOT EXISTS "label_show_price" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "label_extra_text" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        DROP COLUMN IF EXISTS "label_logo_url",
        DROP COLUMN IF EXISTS "label_show_price",
        DROP COLUMN IF EXISTS "label_extra_text"
    `);
  }
}
