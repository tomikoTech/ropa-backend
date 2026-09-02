import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Abonos parciales para venta de terceros. Antes solo había "pagó / no pagó"
 * (booleanos `client_paid` / `supplier_paid`); ahora cada venta admite abonos
 * con su método, en los dos lados (cliente y tercero).
 *
 * Backfill: lo que ya estaba marcado como pagado se convierte en un abono por
 * el total, con su fecha de venta y método, para que el saldo y el desglose
 * por método cuadren con el histórico. Lo no pagado queda a crédito (sin
 * abonos), como estaba.
 */
export class AbonosDeTerceros1788600000000 implements MigrationInterface {
  name = 'AbonosDeTerceros1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consignment_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid,
        "consignment_id" uuid NOT NULL,
        "lado" varchar NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "method" varchar,
        "reference" varchar,
        "paid_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consignment_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_consignment_payments_consignment"
          FOREIGN KEY ("consignment_id") REFERENCES "consignments"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_consignment_payments_tenant_consignment"
         ON "consignment_payments" ("tenant_id", "consignment_id")`,
    );

    // Método normalizado desde el texto libre viejo. Si estaba pagado pero el
    // método no se reconoce (o decía "crédito", que contradice el pago), se
    // asume efectivo: era plata que ya entró.
    const metodoSql = `
      CASE
        WHEN payment_method ILIKE 'efec%' THEN 'EFECTIVO'
        WHEN payment_method ILIKE 'transf%' THEN 'TRANSFERENCIA'
        ELSE 'EFECTIVO'
      END`;

    // Lo que el cliente ya pagó → abono CLIENT por el total de la venta.
    await queryRunner.query(`
      INSERT INTO "consignment_payments"
        (tenant_id, consignment_id, lado, amount, method, paid_at, user_id, notes)
      SELECT c.tenant_id, c.id, 'CLIENT',
             ROUND(c.sale_price * GREATEST(c.quantity, 1), 2),
             ${metodoSql}, c.sale_date, c.user_id,
             'Migrado de "pagado por el cliente"'
      FROM "consignments" c
      WHERE c.client_paid = true
        AND ROUND(c.sale_price * GREATEST(c.quantity, 1), 2) > 0
    `);

    // Lo que ya se le pagó al tercero → abono SUPPLIER por el total del costo.
    await queryRunner.query(`
      INSERT INTO "consignment_payments"
        (tenant_id, consignment_id, lado, amount, method, paid_at, user_id, notes)
      SELECT c.tenant_id, c.id, 'SUPPLIER',
             ROUND(c.cost_price * GREATEST(c.quantity, 1), 2),
             ${metodoSql}, c.sale_date, c.user_id,
             'Migrado de "pagado al tercero"'
      FROM "consignments" c
      WHERE c.supplier_paid = true
        AND ROUND(c.cost_price * GREATEST(c.quantity, 1), 2) > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "consignment_payments"`);
  }
}
