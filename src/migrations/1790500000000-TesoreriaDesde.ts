import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «¿Cómo comienzo el banco y el efectivo desde octubre?» (Andrea, Distri
 * Amber, 2026-10-04). `store_settings.tesoreria_desde`: el día desde el que
 * Bancos e Ingresos cuentan. Lo anterior a esa fecha no suma; el saldo que
 * había ese día se carga como un ajuste fechado ahí.
 */
export class TesoreriaDesde1790500000000 implements MigrationInterface {
  name = 'TesoreriaDesde1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "tesoreria_desde" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "tesoreria_desde"`,
    );
  }
}
