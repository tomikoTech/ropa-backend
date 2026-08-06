import { MigrationInterface, QueryRunner } from 'typeorm';

// F6 — Separados / apartados: tabla reservations + flag por tenant. Idempotente.
export class Reservations1785900100000 implements MigrationInterface {
  name = 'Reservations1785900100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reservations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "variant_id" uuid NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "client_id" uuid,
        "client_name" character varying,
        "note" text,
        "status" character varying NOT NULL DEFAULT 'ACTIVE',
        "expires_at" timestamptz,
        "created_by" uuid,
        "tenant_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reservations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reservations_tenant" ON "reservations" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reservations_variant" ON "reservations" ("variant_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "reservations_enabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "reservations_enabled"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "reservations"`);
  }
}
