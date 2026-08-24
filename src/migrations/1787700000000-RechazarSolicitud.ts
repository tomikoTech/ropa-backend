import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una venta que espera autorización se puede rechazar, con motivo.
 *
 * Hasta ahora una solicitud solo podía convertirse en venta o vencerse sola.
 * Quien la mandó no sabía si le habían dicho que no o si todavía nadie la
 * había mirado, y el vendedor externo —que no está en el local— menos que
 * nadie.
 *
 * El motivo no es adorno: lo lee alguien que no estuvo en la conversación.
 */
export class RechazarSolicitud1787700000000 implements MigrationInterface {
  name = 'RechazarSolicitud1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quotations"
        ADD COLUMN IF NOT EXISTS "rejection_reason" text,
        ADD COLUMN IF NOT EXISTS "rejected_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "rejected_by_user_id" uuid
    `);
    // La pregunta del menú es «cuántas esperan», y se hace en cada carga de
    // página. Sin índice recorre toda la tabla de la tienda.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_quotations_tenant_status"
        ON "quotations" ("tenant_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quotations_tenant_status"`);
    await queryRunner.query(`
      ALTER TABLE "quotations"
        DROP COLUMN IF EXISTS "rejected_by_user_id",
        DROP COLUMN IF EXISTS "rejected_at",
        DROP COLUMN IF EXISTS "rejection_reason"
    `);
  }
}
