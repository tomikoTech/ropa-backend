import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una solicitud interna remitida completa y recibida queda «Recibida».
 *
 * Antes recibir no le cambiaba el estado: se quedaba «Remitida» para siempre,
 * el menú la contaba como pendiente y al abrirla no había nada que hacer
 * (AMAWAD, SO-00001, recibida el 2026-09-21; Andrés, 2026-11-19).
 *
 * Solo toca las que ya terminaron de verdad: todo remitido y ninguna
 * remisión por recibir. La fecha de cierre es la de la última recepción.
 */
export class SolicitudRecibida1791300000000 implements MigrationInterface {
  name = 'SolicitudRecibida1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "internal_requests" r
         SET "status" = 'RECEIVED',
             "closed_at" = COALESCE(r."closed_at", (
               SELECT max(sh."received_at") FROM "internal_request_shipments" sh
                WHERE sh."request_id" = r."id"))
       WHERE r."status" = 'REMITTED'
         AND EXISTS (SELECT 1 FROM "internal_request_shipments" sh
                      WHERE sh."request_id" = r."id")
         AND NOT EXISTS (SELECT 1 FROM "internal_request_shipments" sh
                          WHERE sh."request_id" = r."id" AND sh."received_at" IS NULL)
         AND NOT EXISTS (SELECT 1 FROM "internal_request_items" i
                          WHERE i."request_id" = r."id"
                            AND i."remitted_quantity" < i."requested_quantity")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "internal_requests" SET "status" = 'REMITTED', "closed_at" = NULL WHERE "status" = 'RECEIVED'`,
    );
  }
}
