import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «¿Cómo hago para saber cuántos productos se fabricaron el mes pasado?»
 * (Andrea, Distri Amber, 2026-11-08). César saca esencia y anota en la nota
 * cuántas lociones salieron («136 unidades», «64 U»). Ahora es un campo; las
 * tandas que ya lo decían en la nota lo reciben de ahí.
 */
export class UnidadesFabricadas1791000000000 implements MigrationInterface {
  name = 'UnidadesFabricadas1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "unidades_fabricadas" int`,
    );
    await queryRunner.query(
      `UPDATE "productions"
       SET "unidades_fabricadas" = (regexp_match("notes", '^\\s*(\\d+)'))[1]::int
       WHERE "produced_variant_id" IS NULL
         AND "unidades_fabricadas" IS NULL
         AND "notes" ~ '^\\s*\\d+'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productions" DROP COLUMN IF EXISTS "unidades_fabricadas"`,
    );
  }
}
