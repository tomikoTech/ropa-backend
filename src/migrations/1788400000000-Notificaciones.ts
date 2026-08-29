import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Centro de notificaciones: un aviso por persona (solicitudes, ventas por
 * autorizar, faltantes). El índice por (tenant, usuario, leída) es el que sirve
 * la campanita y el contador de no leídas.
 */
export class Notificaciones1788400000000 implements MigrationInterface {
  name = 'Notificaciones1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid,
        "user_id" uuid NOT NULL,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "body" text NOT NULL,
        "link" varchar,
        "read_at" timestamptz,
        "dedupe_key" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_tenant" ON "notifications" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_user" ON "notifications" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_dedupe" ON "notifications" ("dedupe_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_bell" ON "notifications" ("tenant_id", "user_id", "read_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
