import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cesiones: preguntar o no si ya llegó (y si ya volvió).
 *
 * Apagado por defecto: la cesión queda hecha al despacharla y lo que vuelve
 * entra al registrarlo, sin que nadie confirme. Prendido, el destino confirma
 * que la mercancía le llegó y, al devolver, el origen confirma que volvió.
 * AMAWAD lo quiere apagado; otras tiendas, con dos locales lejos, prendido.
 */
export class ConfirmacionDeCesion1790000000000 implements MigrationInterface {
  name = 'ConfirmacionDeCesion1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "cesion_confirmacion_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" ADD COLUMN IF NOT EXISTS "llegada_confirmada_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" ADD COLUMN IF NOT EXISTS "llegada_confirmada_por" uuid`,
    );
    // Las cesiones que ya existen se hicieron sin preguntar: quedan llegadas.
    await queryRunner.query(
      `UPDATE "street_dispatches" SET "llegada_confirmada_at" = "created_at" WHERE "llegada_confirmada_at" IS NULL`,
    );
    // Lo que el destino dice que devolvió y el origen todavía no recibió.
    await queryRunner.query(
      `ALTER TABLE "street_dispatch_items" ADD COLUMN IF NOT EXISTS "quantity_returning" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "street_dispatch_items" DROP COLUMN IF EXISTS "quantity_returning"`);
    await queryRunner.query(`ALTER TABLE "street_dispatches" DROP COLUMN IF EXISTS "llegada_confirmada_por"`);
    await queryRunner.query(`ALTER TABLE "street_dispatches" DROP COLUMN IF EXISTS "llegada_confirmada_at"`);
    await queryRunner.query(`ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "cesion_confirmacion_enabled"`);
  }
}
