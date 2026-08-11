import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cuánta plata entregó el patinador al cuadrar la remisión.
 *
 * Antes solo se guardaba lo que **vendió**, y como la pantalla deja registrar
 * un cobro menor, la diferencia desaparecía: la venta quedaba marcada como
 * pagada completa aunque el patinador hubiera entregado menos. Con esta columna
 * la deuda queda escrita, y la venta se guarda como pendiente de pago mientras
 * exista.
 */
export class StreetCollectedAmount1786320000000 implements MigrationInterface {
  name = 'StreetCollectedAmount1786320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" ADD COLUMN IF NOT EXISTS "collected_amount" numeric(14,2)`,
    );
    // Las remisiones ya cuadradas se dan por cobradas completas: es lo que el
    // sistema afirmaba hasta ahora, y no hay forma de saber otra cosa.
    await queryRunner.query(`
      UPDATE "street_dispatches" d
      SET "collected_amount" = COALESCE((
        SELECT SUM(i."quantity_sold" * i."unit_price")
        FROM "street_dispatch_items" i
        WHERE i."dispatch_id" = d."id"
      ), 0)
      WHERE d."status" = 'SETTLED' AND d."collected_amount" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" DROP COLUMN IF EXISTS "collected_amount"`,
    );
  }
}
