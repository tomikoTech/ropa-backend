import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `credit_default_days` en `store_settings`: a cuántos días vence una venta a
 * crédito si el vendedor no elige plazo.
 *
 * **Treinta días para todas, noventa para AMAWAD.** Treinta es el plazo
 * corriente —el mismo supuesto que ya usa `DIAS_DE_PLAZO_ASUMIDO` en compras
 * para la deuda con el proveedor—; AMAWAD vende a noventa y estaba escribiendo
 * la misma fecha en cada factura.
 *
 * Es solo el valor inicial: el vendedor cambia la fecha por venta, y cada
 * tienda cambia su plazo en Ajustes. Un cero ahí significa «sin plazo por
 * defecto» y devuelve el campo vacío de antes.
 */
export class PlazoDeCreditoPorDefecto1789200000000
  implements MigrationInterface
{
  name = 'PlazoDeCreditoPorDefecto1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `DEFAULT 30` cubre también a las tiendas que se creen después de esto.
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "credit_default_days" integer DEFAULT 30`,
    );
    // Las filas que ya existían nacieron nulas: se les pone el mismo 30.
    await queryRunner.query(
      `UPDATE "store_settings" SET "credit_default_days" = 30 WHERE "credit_default_days" IS NULL`,
    );
    // Y AMAWAD, que vende a noventa.
    await queryRunner.query(
      `UPDATE "store_settings" s SET "credit_default_days" = 90
         FROM "tenants" t
        WHERE t.id = s.tenant_id AND t.slug = 'amawad'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "credit_default_days"`,
    );
  }
}
