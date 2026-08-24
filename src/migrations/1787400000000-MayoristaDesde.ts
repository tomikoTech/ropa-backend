import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Desde cuántas unidades de la misma referencia se cobra al por mayor.
 *
 * Nace en cero **a propósito**: cero significa apagado, y apagado es como se
 * comportaba el sistema hasta hoy —el mayoreo solo se disparaba al vender una
 * caja cerrada—. Ninguna tienda amanece cobrando distinto sin haberlo pedido.
 */
export class MayoristaDesde1787400000000 implements MigrationInterface {
  name = 'MayoristaDesde1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        ADD COLUMN IF NOT EXISTS "mayorista_desde" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "mayorista_desde"
    `);
  }
}
