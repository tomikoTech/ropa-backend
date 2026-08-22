import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La reposición se pide sola.
 *
 * Ya existían las solicitudes internas, pero había que crearlas a mano o
 * configurar un mínimo por variante que en la práctica nadie configuraba. La
 * queja de una tienda sobre su sistema anterior fue exactamente esa: «siempre
 * hay que notificar, reponer ese, reponer ese; solo debería ser automático».
 *
 * Todo configurable y **apagado por defecto**: no todas las tiendas trabajan
 * con bodega aparte, y encenderlo para todas llenaría de solicitudes a quien
 * vende de un solo local.
 */
export class ReposicionAutomatica1787001000000 implements MigrationInterface {
  name = 'ReposicionAutomatica1787001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        ADD COLUMN IF NOT EXISTS "auto_replenish_enabled" boolean NOT NULL DEFAULT false,
        -- Cuando el local baja a esto o menos, se pide. Uno = «cuando quede el último».
        ADD COLUMN IF NOT EXISTS "auto_replenish_threshold" integer NOT NULL DEFAULT 1,
        -- Hasta cuánto se repone.
        ADD COLUMN IF NOT EXISTS "auto_replenish_target" integer NOT NULL DEFAULT 3,
        -- De qué bodega sale. Nulo = la que más tenga.
        ADD COLUMN IF NOT EXISTS "auto_replenish_source_warehouse_id" uuid,
        -- Qué productos. Nulo = todos; lista vacía = ninguno todavía.
        ADD COLUMN IF NOT EXISTS "auto_replenish_product_ids" uuid[]
    `);
    // Marca las solicitudes que nacieron solas: sirve para agruparlas —cinco
    // ventas no pueden dejar cinco solicitudes— y para que quien las reciba
    // sepa que nadie las escribió.
    await queryRunner.query(`
      ALTER TABLE "internal_requests"
      ADD COLUMN IF NOT EXISTS "origen_automatico" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_settings"
        DROP COLUMN IF EXISTS "auto_replenish_enabled",
        DROP COLUMN IF EXISTS "auto_replenish_threshold",
        DROP COLUMN IF EXISTS "auto_replenish_target",
        DROP COLUMN IF EXISTS "auto_replenish_source_warehouse_id",
        DROP COLUMN IF EXISTS "auto_replenish_product_ids"
    `);
    await queryRunner.query(`
      ALTER TABLE "internal_requests"
      DROP COLUMN IF EXISTS "origen_automatico"
    `);
  }
}
