import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cuadre y cierre de caja diario.
 *
 * Hasta ahora había método de pago por venta, bancos e ingresos, pero nadie
 * cerraba el día: no existía la pantalla donde una tienda mira cuánto entró en
 * efectivo y cuánto por transferencia, por local y por vendedor, con el
 * comprobante a la vista.
 *
 * Dos interruptores, los dos **apagados por defecto**: exigir el comprobante
 * de la transferencia frena el cobro con el cliente enfrente, y el cierre de
 * turno deja a alguien sin poder vender. Ninguna tienda debe amanecer con eso
 * encendido sin haberlo pedido.
 */
export class CuadreYCierreDeCaja1787002000000 implements MigrationInterface {
  name = 'CuadreYCierreDeCaja1787002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        -- «Entro a transferencias, entro a la foto, corroboro que haya entrado
        -- esa plata». Sin foto no hay nada que corroborar.
        ADD COLUMN IF NOT EXISTS "comprobante_transferencia_obligatorio" boolean NOT NULL DEFAULT false,
        -- «Los vendedores estaban vendiendo y liquidando a las 10 de la noche».
        ADD COLUMN IF NOT EXISTS "cierre_de_caja_enabled" boolean NOT NULL DEFAULT false
    `);

    // Quién cobró el abono. La tabla no lo guardaba: al cuadrar el día, la
    // plata de cartera quedaba a nombre de quien había vendido meses atrás y
    // no de quien la recibió hoy en el mostrador. Nulo en las filas viejas; la
    // consulta cae al vendedor de la venta cuando falta.
    await queryRunner.query(`
      ALTER TABLE "accounts_receivable_payments"
      ADD COLUMN IF NOT EXISTS "user_id" uuid
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cierres_de_caja" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid,
        "warehouse_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        -- El día de la tienda como texto: una conversión de zona no puede
        -- correrlo un día, que es justo el error que este módulo evita.
        "dia" character varying(10) NOT NULL,
        "efectivo_esperado" numeric(14,2) NOT NULL DEFAULT 0,
        "efectivo_contado" numeric(14,2) NOT NULL DEFAULT 0,
        "diferencia" numeric(14,2) NOT NULL DEFAULT 0,
        "total_transferencia" numeric(14,2) NOT NULL DEFAULT 0,
        "total_tarjeta" numeric(14,2) NOT NULL DEFAULT 0,
        "total_otros" numeric(14,2) NOT NULL DEFAULT 0,
        "total_abonos" numeric(14,2) NOT NULL DEFAULT 0,
        "total_general" numeric(14,2) NOT NULL DEFAULT 0,
        "transferencias_sin_comprobante" integer NOT NULL DEFAULT 0,
        "notas" character varying,
        "cerrado_por_id" uuid NOT NULL,
        "cerrado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "reabierto_en" TIMESTAMP WITH TIME ZONE,
        "reabierto_por_id" uuid,
        "motivo_reapertura" character varying,
        CONSTRAINT "PK_cierres_de_caja" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cierres_de_caja_tenant_dia"
      ON "cierres_de_caja" ("tenant_id", "dia")
    `);

    // Un solo cierre vigente por (tienda, local, vendedor, día). Parcial —solo
    // los no reabiertos— para que reabrir y volver a cerrar siga siendo
    // posible sin borrar el rastro del primero. Es la red contra dos clics
    // simultáneos del botón de cerrar.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cierre_vigente"
      ON "cierres_de_caja" ("tenant_id", "warehouse_id", "user_id", "dia")
      WHERE "reabierto_en" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cierre_vigente"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cierres_de_caja_tenant_dia"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "cierres_de_caja"`);
    await queryRunner.query(`
      ALTER TABLE "accounts_receivable_payments" DROP COLUMN IF EXISTS "user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        DROP COLUMN IF EXISTS "comprobante_transferencia_obligatorio",
        DROP COLUMN IF EXISTS "cierre_de_caja_enabled"
    `);
  }
}
