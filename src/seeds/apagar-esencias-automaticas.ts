/**
 * Apaga las esencias que nacieron solas y nunca se usaron.
 *
 * Con la gestión automática encendida, cada loción creaba una «Esencia X»:
 * Distri Amber llegó a 161. Ellos compran esencias de verdad —una sirve a
 * varias lociones— así que lo automático se apagó y las que quedaron con
 * stock cero y sin movimientos se **inactivan** (no se borran: si una tiene
 * historial, se queda). La lista de esencias reales la manda Andrea.
 *
 *     node dist/seeds/apagar-esencias-automaticas.js            (ensayo)
 *     MODE=apply TENANT=distriamber node dist/seeds/apagar-esencias-automaticas.js
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const slug = process.env.TENANT?.trim() || 'distriamber';
  await AppDataSource.initialize();
  try {
    const filas: {
      id: string;
      name: string;
      stock: string;
      movimientos: string;
      usos: string;
    }[] = await AppDataSource.query(
      `SELECT p.id, p.name,
                (SELECT coalesce(sum(st.quantity),0) FROM stock st JOIN product_variants v ON v.id = st.variant_id WHERE v.product_id = p.id) AS stock,
                (SELECT count(*) FROM stock_movements sm JOIN product_variants v ON v.id = sm.variant_id WHERE v.product_id = p.id) AS movimientos,
                (SELECT count(*) FROM product_essences pe JOIN product_variants v ON v.id = pe.essence_variant_id WHERE v.product_id = p.id) AS usos
           FROM products p JOIN tenants t ON t.id = p.tenant_id JOIN categories c ON c.id = p.category_id
          WHERE t.slug = $1 AND c.type = 'ESSENCE' AND p.status = 'ACTIVE'
            AND (p.description LIKE '%[auto-esencia]%' OR p.name ILIKE 'Esencia %')
          ORDER BY p.name`,
      [slug],
    );
    const sinUso = filas.filter(
      (f) =>
        Number(f.stock) === 0 &&
        Number(f.movimientos) === 0 &&
        Number(f.usos) === 0,
    );
    const conStock = filas.filter((f) => Number(f.stock) !== 0);
    console.log(
      `${aplicar ? 'APLICANDO' : 'ENSAYO'} en ${slug}: ${filas.length} esencias automáticas activas`,
    );
    console.log(`  sin stock ni historial → se inactivan: ${sinUso.length}`);
    console.log(
      `  con stock → se quedan: ${conStock.length} (${conStock.reduce((s, f) => s + Number(f.stock), 0)} g)`,
    );
    console.log(
      `  con historial pero sin stock → se quedan: ${filas.length - sinUso.length - conStock.length}`,
    );
    if (aplicar && sinUso.length) {
      await AppDataSource.query(
        `UPDATE products SET status = 'INACTIVE', is_published = false, is_available = false WHERE id = ANY($1::uuid[])`,
        [sinUso.map((f) => f.id)],
      );
      console.log('Hecho.');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
