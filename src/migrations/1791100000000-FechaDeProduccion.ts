import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Si lo ingresa ahora no saldrá con fecha de octubre» (Andrea, Distri Amber,
 * 2026-11-09). La salida de esencia que se registra después guarda el día en
 * que de verdad se produjo, y el historial del mes cuenta por ese día.
 */
export class FechaDeProduccion1791100000000 implements MigrationInterface {
  name = 'FechaDeProduccion1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "fecha_de_produccion" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productions" DROP COLUMN IF EXISTS "fecha_de_produccion"`,
    );
  }
}
