import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Ese descuento a los 30 días es para que no se le aplique inmediatamente;
 * en esta factura no debería ir, solo si no aplicamos el descuento»
 * (Andrea, Distri Amber, 2026-10-06). La nota al pie de la factura puede
 * ser una condición de pronto pago: con el descuento ya aplicado, sobra.
 */
export class NotaAlPieSoloSinDescuento1790700000000 implements MigrationInterface {
  name = 'NotaAlPieSoloSinDescuento1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "nota_al_pie_solo_sin_descuento" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "nota_al_pie_solo_sin_descuento"`,
    );
  }
}
