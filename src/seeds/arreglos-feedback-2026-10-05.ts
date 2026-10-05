/**
 * Lo que Andrea vio raro el 4–5 oct 2026 y es dato, no código:
 *
 *  - «212 NYC MEN dice FRASCOS y de eso no tenemos»: la migración del 3 oct
 *    dejó filas de stock en 0 en la bodega FRASCOS para lociones. Se borran
 *    (están en cero, sin unidades: no mueven inventario).
 *  - «¿Por qué dice Frascos?» en el catálogo público: había frascos y esencias
 *    publicados. Se despublican.
 *  - «Falta el descuento del 20 %»: en Promociones solo estaban 10 y 15. Se
 *    crean 20 DCTO y 30 DCTO, iguales a los presets del POS.
 *  - «Quitar Imperial Perfumes»: título del hero y texto «Acerca de».
 *
 *     node dist/seeds/arreglos-feedback-2026-10-05.js apply
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';

const APLICAR = process.argv[2] === 'apply';

async function main() {
  await AppDataSource.initialize();
  const ds = AppDataSource;
  try {
    const [{ id: t }] = await ds.query(
      `SELECT id FROM tenants WHERE slug = 'distriamber'`,
    );

    const filasEnCero: { id: string; name: string }[] = await ds.query(
      `SELECT s.id, p.name
         FROM stock s JOIN product_variants v ON v.id = s.variant_id JOIN products p ON p.id = v.product_id
         LEFT JOIN categories c ON c.id = p.category_id JOIN warehouses w ON w.id = s.warehouse_id
        WHERE s.tenant_id = $1 AND w.name = 'FRASCOS' AND coalesce(c.type,'STANDARD') <> 'FRASCO' AND s.quantity = 0
          AND NOT EXISTS (SELECT 1 FROM stock_units u WHERE u.variant_id = s.variant_id AND u.warehouse_id = s.warehouse_id AND u.status = 'IN_STOCK')`,
      [t],
    );
    console.log(`Filas en 0 de lociones en FRASCOS: ${filasEnCero.length}`, filasEnCero.map((f) => f.name).join(', '));

    const publicados: { id: string; name: string }[] = await ds.query(
      `SELECT p.id, p.name FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.tenant_id = $1 AND c.type IN ('FRASCO','ESSENCE') AND p.is_published`,
      [t],
    );
    console.log(`Frascos/esencias publicados: ${publicados.length}`);

    const promos: { name: string }[] = await ds.query(
      `SELECT name FROM promotions WHERE tenant_id = $1 AND is_active`,
      [t],
    );
    const faltan = [20, 30].filter((p) => !promos.some((x) => x.name === `${p} DCTO`));
    console.log(`Promociones que faltan: ${faltan.map((p) => p + ' DCTO').join(', ') || 'ninguna'}`);

    if (!APLICAR) {
      console.log('Ensayo. Para aplicar: apply');
      return;
    }
    await ds.transaction(async (m) => {
      if (filasEnCero.length) {
        // ledger-exento: filas en cero sin unidades; borrar la fila no mueve stock.
        await m.query(`DELETE FROM stock WHERE id = ANY($1::uuid[]) AND quantity = 0`, [filasEnCero.map((f) => f.id)]);
      }
      if (publicados.length) {
        await m.query(`UPDATE products SET is_published = false WHERE id = ANY($1::uuid[])`, [publicados.map((p) => p.id)]);
      }
      for (const p of faltan) {
        await m.query(
          `INSERT INTO promotions (tenant_id, name, description, discount_type, discount_value, applicable_to, start_date, end_date, max_uses, current_uses, is_active)
           VALUES ($1, $2, '', 'PERCENTAGE', $3, 'ALL', '2026-10-01', '2030-01-03', 1000, 0, true)`,
          [t, `${p} DCTO`, p],
        );
      }
      await m.query(
        `UPDATE store_settings SET hero_title = 'DISTRI AMBER.', about_text = replace(about_text, 'Imperial Perfumes', 'Distri Amber') WHERE tenant_id = $1`,
        [t],
      );
    });
    console.log('Aplicado.');
  } finally {
    await ds.destroy();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
