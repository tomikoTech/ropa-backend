import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La plantilla de la vitrina: qué referencias tienen puesto en el aparador.
 *
 * Se vendió la muestra y la referencia no sale: queda un hueco que hay que
 * reponer. Arranca con lo que ya está o estuvo en cada vitrina (bultos que
 * están o se vendieron ahí, y existencia agregada), para que las tiendas que
 * ya exhiben no tengan que volver a marcar nada.
 */
export class PlantillaDeVitrina1789900000000 implements MigrationInterface {
  name = 'PlantillaDeVitrina1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vitrina_plantilla" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "vitrina_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vitrina_plantilla" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vitrina_plantilla_vitrina_producto" UNIQUE ("vitrina_id", "product_id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vitrina_plantilla_tenant" ON "vitrina_plantilla" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vitrina_plantilla_vitrina" ON "vitrina_plantilla" ("vitrina_id")`,
    );
    // Lo que ya está o estuvo en la vitrina tiene puesto.
    await queryRunner.query(`
      INSERT INTO "vitrina_plantilla" ("tenant_id", "vitrina_id", "product_id")
      SELECT DISTINCT su.tenant_id, su.warehouse_id, su.product_id
        FROM stock_units su
        JOIN warehouses w ON w.id = su.warehouse_id AND w.is_exhibition = true
       WHERE su.status IN ('IN_STOCK', 'SOLD')
      UNION
      SELECT DISTINCT s.tenant_id, s.warehouse_id, pv.product_id
        FROM stock s
        JOIN warehouses w ON w.id = s.warehouse_id AND w.is_exhibition = true
        JOIN product_variants pv ON pv.id = s.variant_id
       WHERE s.quantity > 0
      ON CONFLICT DO NOTHING`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vitrina_plantilla"`);
  }
}
