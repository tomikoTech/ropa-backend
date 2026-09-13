import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La cesión ahora puede ir a **una bodega**, no solo a una persona.
 *
 * «Que la bodega principal le preste a otra bodega u otro local dentro del
 * mismo sistema», y al revés: un local le presta a la principal. Sale gratis en
 * los dos sentidos porque origen y destino son los dos campos de siempre.
 *
 * `street_seller_id` deja de ser obligatorio: cuando el destino es una bodega
 * no hay patinador. Las cesiones que ya existían se marcan `PERSONA`, que es lo
 * único que podían ser.
 */
export class CesionABodega1789500000000 implements MigrationInterface {
  name = 'CesionABodega1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" ADD COLUMN IF NOT EXISTS "destino_tipo" varchar(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" ADD COLUMN IF NOT EXISTS "destino_warehouse_id" uuid`,
    );
    // Lo que ya existía solo podía ir a un patinador.
    await queryRunner.query(
      `UPDATE "street_dispatches" SET "destino_tipo" = 'PERSONA' WHERE "destino_tipo" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" ALTER COLUMN "street_seller_id" DROP NOT NULL`,
    );
    // Sin índice, «qué le presté a este local» recorre todas las cesiones de
    // la tienda para leer dos filas.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_street_dispatches_destino_bodega"
         ON "street_dispatches" ("destino_warehouse_id")`,
    );
    // La regla, también en la base: exactamente un destino, nunca dos ni
    // ninguno. En el código vive en `destino-de-la-cesion.ts`; acá queda por si
    // alguien escribe por fuera.
    await queryRunner.query(
      `ALTER TABLE "street_dispatches"
         ADD CONSTRAINT "CHK_street_dispatches_un_destino"
         CHECK (
           ("destino_tipo" = 'PERSONA' AND "street_seller_id" IS NOT NULL AND "destino_warehouse_id" IS NULL)
           OR
           ("destino_tipo" = 'BODEGA' AND "destino_warehouse_id" IS NOT NULL AND "street_seller_id" IS NULL)
         )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" DROP CONSTRAINT IF EXISTS "CHK_street_dispatches_un_destino"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_street_dispatches_destino_bodega"`,
    );
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" DROP COLUMN IF EXISTS "destino_warehouse_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "street_dispatches" DROP COLUMN IF EXISTS "destino_tipo"`,
    );
  }
}
