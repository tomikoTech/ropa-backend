import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La libreta de productos de tercero.
 *
 * Quien revende compra al detal y anota cuando vende: el mismo par vuelve a
 * pasar, y volver a escribir dueno, descripcion, talla, color, costo y precio
 * cada vez es el trabajo que hace que al final no se anote nada.
 *
 * No es inventario —no hay existencias ni bodega, porque no hay bodega—: es lo
 * que ya se vendio alguna vez, para no volver a escribirlo.
 */
export class ProductosDeTercero1787900000000 implements MigrationInterface {
  name = 'ProductosDeTercero1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "third_party_products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "clave" varchar NOT NULL,
        "third_party_name" varchar NOT NULL,
        "product_description" varchar NOT NULL,
        "size" varchar NOT NULL DEFAULT '',
        "color" varchar NOT NULL DEFAULT '',
        "last_cost_price" numeric(12,2) NOT NULL DEFAULT 0,
        "last_sale_price" numeric(12,2) NOT NULL DEFAULT 0,
        "times_sold" integer NOT NULL DEFAULT 0,
        "last_sold_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_third_party_products" PRIMARY KEY ("id")
      )
    `);
    // Unico por tienda: la misma libreta no puede tener dos veces el mismo par.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_third_party_products_clave"
        ON "third_party_products" ("tenant_id", "clave")
    `);
    // La pregunta de la pantalla es «que le he vendido a este», y se hace
    // mientras hay un cliente enfrente.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_third_party_products_dueno"
        ON "third_party_products" ("tenant_id", "third_party_name")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "third_party_products"`);
  }
}
