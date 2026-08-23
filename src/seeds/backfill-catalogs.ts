/**
 * Backfill GLOBAL de los catálogos de tallas y colores.
 *
 * Recorre las variantes existentes de **todos los tenants** y crea la talla y el
 * color que falten en `sizes` / `colors`. Es la migración de datos de la Fase 1:
 * deja a cada tenant con su catálogo ya poblado, sin trabajo manual.
 *
 * - **Idempotente**: correrlo dos veces no duplica (respeta @Unique(tenant,name)).
 * - **No modifica variantes**: `ProductVariant.size/color` siguen siendo texto.
 * - El `sortOrder` de las tallas se deduce del nombre (38 -> 380, "M" -> 10030).
 *
 * Uso:
 *   nest build && node dist/seeds/backfill-catalogs.js          # usa .env (¡PROD!)
 *   DRY_RUN=1 node dist/seeds/backfill-catalogs.js              # solo reporta
 *   DB_HOST=localhost DB_USERNAME=dylanbc1 DB_PASSWORD= DB_DATABASE=ropa_pos \
 *     node dist/seeds/backfill-catalogs.js                      # local
 */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Size } from '../catalogs/entities/size.entity.js';
import { Color } from '../catalogs/entities/color.entity.js';
import { deriveSortOrder } from '../catalogs/sizes.service.js';
import { esHostLocal } from '../common/utils/host-local.js';

dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';

function buildDataSource(): DataSource {
  const host = process.env.DB_HOST || 'localhost';
  const isLocal = esHostLocal(host);
  return new DataSource({
    type: 'postgres',
    host,
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME || 'dylanbc1',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'ropa_pos',
    ssl: isLocal ? false : { rejectUnauthorized: false },
    // Solo las entidades que se escriben. Las variantes se leen con SQL crudo
    // para no arrastrar todo el grafo de relaciones de Product.
    entities: [Size, Color],
    synchronize: false,
  });
}

async function main() {
  const ds = await buildDataSource().initialize();
  console.log(`Backfill de catálogos ${DRY_RUN ? '(DRY RUN)' : ''}`);

  const sizeRepo = ds.getRepository(Size);
  const colorRepo = ds.getRepository(Color);

  /** Pares (tenant, valor) distintos que hoy existen en las variantes. */
  const distinctValues = (column: 'size' | 'color') =>
    ds.query<{ tenantId: string; name: string }[]>(
      `SELECT tenant_id AS "tenantId", TRIM(${column}) AS name
         FROM product_variants
        WHERE tenant_id IS NOT NULL
          AND COALESCE(TRIM(${column}), '') <> ''
        GROUP BY tenant_id, TRIM(${column})`,
    );

  const sizeRows = await distinctValues('size');
  const colorRows = await distinctValues('color');

  console.log(
    `  encontrados: ${sizeRows.length} tallas y ${colorRows.length} colores (tenant+valor distintos)`,
  );

  // Lo ya existente, para no re-consultar por cada fila.
  const existingSizes = new Set(
    (await sizeRepo.find()).map((s) => `${s.tenantId}::${s.name}`),
  );
  const existingColors = new Set(
    (await colorRepo.find()).map((c) => `${c.tenantId}::${c.name}`),
  );

  const newSizes = sizeRows
    .filter((r) => !existingSizes.has(`${r.tenantId}::${r.name}`))
    .map((r) =>
      sizeRepo.create({
        tenantId: r.tenantId,
        name: r.name,
        sortOrder: deriveSortOrder(r.name),
      }),
    );
  const newColors = colorRows
    .filter((r) => !existingColors.has(`${r.tenantId}::${r.name}`))
    .map((r) => colorRepo.create({ tenantId: r.tenantId, name: r.name }));

  console.log(
    `  a crear: ${newSizes.length} tallas, ${newColors.length} colores`,
  );

  if (DRY_RUN) {
    const sample = (arr: { tenantId: string; name: string }[]) =>
      arr
        .slice(0, 8)
        .map((x) => x.name)
        .join(', ');
    if (newSizes.length) console.log(`    tallas:  ${sample(newSizes)}...`);
    if (newColors.length) console.log(`    colores: ${sample(newColors)}...`);
    await ds.destroy();
    return;
  }

  // chunk: los tenants grandes pueden traer cientos de valores.
  if (newSizes.length) await sizeRepo.save(newSizes, { chunk: 200 });
  if (newColors.length) await colorRepo.save(newColors, { chunk: 200 });

  const totalSizes = await sizeRepo.count();
  const totalColors = await colorRepo.count();
  console.log(`  catálogo: ${totalSizes} tallas, ${totalColors} colores.`);

  // ── Paso 2 del expand-migrate-contract: vincular las FK de las variantes ──
  // Se hace en SQL de un golpe (no fila por fila): son cientos de miles de
  // variantes en los tenants grandes.
  const linked = await linkVariantForeignKeys(ds);
  console.log(
    `  variantes vinculadas: ${linked.sizes} por talla, ${linked.colors} por color.`,
  );

  const orphans = await ds.query<{ kind: string; total: string }[]>(
    `SELECT 'talla' AS kind, COUNT(*)::text AS total
       FROM product_variants
      WHERE COALESCE(TRIM(size), '') <> '' AND size_id IS NULL
      UNION ALL
     SELECT 'color', COUNT(*)::text
       FROM product_variants
      WHERE COALESCE(TRIM(color), '') <> '' AND color_id IS NULL`,
  );
  const pending = orphans.filter((o) => Number(o.total) > 0);
  if (pending.length) {
    console.warn(
      `  ⚠ quedaron sin vincular: ${pending
        .map((o) => `${o.total} por ${o.kind}`)
        .join(', ')} (revisar antes del paso CONTRACT)`,
    );
  } else {
    console.log('  ✅ sin variantes pendientes de vincular.');
  }

  console.log('✅ Listo.');
  await ds.destroy();
}

/**
 * Enlaza `product_variants.size_id/color_id` con el catálogo, emparejando por
 * (tenant, texto). Idempotente: solo toca las filas que aún no están vinculadas.
 */
async function linkVariantForeignKeys(
  ds: DataSource,
): Promise<{ sizes: number; colors: number }> {
  const link = async (
    column: 'size' | 'color',
    table: 'sizes' | 'colors',
  ): Promise<number> => {
    const result = await ds.query<unknown[]>(
      `UPDATE product_variants v
          SET ${column}_id = c.id
         FROM ${table} c
        WHERE c.tenant_id = v.tenant_id
          AND c.name = TRIM(v.${column})
          AND v.${column}_id IS NULL
          AND COALESCE(TRIM(v.${column}), '') <> ''`,
    );
    // node-postgres devuelve [rows, rowCount] para UPDATE vía query().
    return Array.isArray(result) && typeof result[1] === 'number'
      ? result[1]
      : 0;
  };

  return {
    sizes: await link('size', 'sizes'),
    colors: await link('color', 'colors'),
  };
}

main().catch((err) => {
  console.error('Backfill falló:', err);
  process.exit(1);
});
