import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cada tienda decide si el POS da la venta por cobrada al cerrarla.
 *
 * El valor por defecto es **sí**: en un mostrador se paga en el momento y dejar
 * a deber es la excepción. Estuvo al revés y una tienda lo reportó —cobraron
 * por transferencia y la factura salió «Sin pagar»—.
 *
 * Distri Amber es la excepción de verdad: factura primero y cobra después, así
 * que ahí arranca apagado. Se identifica por el slug del tenant y no por su
 * uuid para que esta migración diga a quién se refiere.
 */
export class PosMarkPaidDefault1787000200000 implements MigrationInterface {
  name = 'PosMarkPaidDefault1787000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "pos_mark_paid_default" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`
      UPDATE "store_settings" AS ss
      SET "pos_mark_paid_default" = false
      FROM "tenants" AS t
      WHERE ss."tenant_id" = t."id" AND t."slug" = 'distriamber'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "pos_mark_paid_default"`,
    );
  }
}
