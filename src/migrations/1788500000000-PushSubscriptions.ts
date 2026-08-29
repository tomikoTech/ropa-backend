import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suscripciones de dispositivos al push (Web Push). El `endpoint` es único: si
 * un dispositivo vuelve a suscribirse, se actualiza esa misma fila.
 */
export class PushSubscriptions1788500000000 implements MigrationInterface {
  name = 'PushSubscriptions1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid,
        "user_id" uuid NOT NULL,
        "endpoint" text NOT NULL,
        "p256dh" varchar NOT NULL,
        "auth" varchar NOT NULL,
        "user_agent" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE ("endpoint")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_push_subscriptions_user" ON "push_subscriptions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_push_subscriptions_tenant" ON "push_subscriptions" ("tenant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
  }
}
