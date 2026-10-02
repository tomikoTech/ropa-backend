/**
 * Junta las fichas repetidas de Distri Amber: clientes y productos.
 *
 * Por qué existen: la tanda de clientes del 3 de julio de 2026 tenía nombre y
 * apellido separados; el importador del 3 de agosto comparaba solo
 * `first_name` contra el nombre completo, no los encontró y creó 56 copias.
 * En veinte parejas las dos tienen ventas: se **fusionan** con la misma regla
 * que usa el botón del sistema (`ClientsService.fusionar`): sobrevive la más
 * antigua y recibe todo lo de la otra.
 *
 * Los cuatro productos repetidos son otro caso: la copia vieja viene del
 * import de junio, sin stock ni ventas. Esa se **borra** si de verdad nada la
 * referencia; si algo la referencia, se avisa y no se toca.
 *
 * Uso (siempre primero en ensayo):
 *     node dist/seeds/fusionar-duplicados-distriamber.js
 *     MODE=apply node dist/seeds/fusionar-duplicados-distriamber.js
 *
 * `TENANT` cambia la tienda (por defecto `distriamber`).
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import {
  agruparDuplicados,
  planDeFusion,
  TABLAS_QUE_APUNTAN_AL_CLIENTE,
  type ClienteParaFusion,
} from '../clients/fusionar-clientes.js';

type Fila = ClienteParaFusion & { ventas: number };

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const slug = process.env.TENANT?.trim() || 'distriamber';
  await AppDataSource.initialize();
  const ds = AppDataSource;
  try {
    const [tenant]: { id: string }[] = await ds.query(
      `SELECT id FROM tenants WHERE slug = $1`,
      [slug],
    );
    if (!tenant) throw new Error(`No existe la tienda ${slug}`);
    const t = tenant.id;
    console.log(`${aplicar ? 'APLICANDO' : 'ENSAYO'} en ${slug}`);

    // ── Clientes ──
    const clientes: Fila[] = await ds.query(
      `SELECT c.id, c.first_name AS "firstName", c.last_name AS "lastName",
              c.document_number AS "documentNumber", c.phone, c.email, c.address,
              c.created_at AS "createdAt",
              (SELECT count(*) FROM sales s WHERE s.client_id = c.id)::int AS ventas
         FROM clients c WHERE c.tenant_id = $1 AND c.is_generic = false`,
      [t],
    );
    const grupos = agruparDuplicados(clientes);
    console.log(
      `Clientes: ${clientes.length}; grupos repetidos: ${grupos.length}`,
    );
    let movidas = 0;
    for (const grupo of grupos) {
      const plan = planDeFusion(grupo);
      const nombre =
        `${plan.sobrevive.firstName ?? ''} ${plan.sobrevive.lastName ?? ''}`.trim();
      const ventasQueLlegan = plan.absorbidos.reduce((s, a) => s + a.ventas, 0);
      movidas += ventasQueLlegan;
      console.log(
        `  ${nombre} ← ${plan.absorbidos.length} copia(s), ${ventasQueLlegan} venta(s) que se mueven` +
          (Object.keys(plan.completar).length
            ? `, completa ${Object.keys(plan.completar).join('/')}`
            : ''),
      );
      if (!aplicar) continue;
      await ds.transaction(async (m) => {
        for (const a of plan.absorbidos) {
          for (const tabla of TABLAS_QUE_APUNTAN_AL_CLIENTE) {
            await m.query(
              `UPDATE "${tabla}" SET client_id = $1 WHERE client_id = $2 AND tenant_id = $3`,
              [plan.sobrevive.id, a.id, t],
            );
          }
          await m.query(
            `DELETE FROM clients WHERE id = $1 AND tenant_id = $2`,
            [a.id, t],
          );
        }
        const campos = Object.entries(plan.completar);
        if (campos.length) {
          const columna: Record<string, string> = {
            documentNumber: 'document_number',
            phone: 'phone',
            email: 'email',
            address: 'address',
          };
          const sets = campos
            .map(([k], i) => `${columna[k]} = $${i + 3}`)
            .join(', ');
          await m.query(
            `UPDATE clients SET ${sets} WHERE id = $1 AND tenant_id = $2`,
            [plan.sobrevive.id, t, ...campos.map(([, v]) => v)],
          );
        }
      });
    }
    console.log(`Ventas que cambian de ficha: ${movidas}`);

    // ── Productos ──
    const repetidos: { name: string; ids: string[] }[] = await ds.query(
      // La que sobrevive va de última: la de más ventas; a igual ventas, la
      // de más stock; a igual todo, la más vieja.
      `SELECT lower(trim(p.name)) AS name,
              array_agg(p.id ORDER BY
                (SELECT count(*) FROM sale_items si JOIN product_variants v ON v.id = si.variant_id WHERE v.product_id = p.id),
                (SELECT coalesce(sum(st.quantity),0) FROM stock st JOIN product_variants v ON v.id = st.variant_id WHERE v.product_id = p.id),
                p.created_at DESC) AS ids
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.tenant_id = $1
        GROUP BY lower(trim(p.name)), coalesce(c.type::text, 'STANDARD')
       HAVING count(*) > 1`,
      [t],
    );
    console.log(`Productos repetidos: ${repetidos.length} grupo(s)`);
    for (const g of repetidos) {
      for (const id of g.ids) {
        const [uso]: Record<string, string>[] = await ds.query(
          `SELECT
             (SELECT coalesce(sum(st.quantity),0) FROM stock st JOIN product_variants v ON v.id = st.variant_id WHERE v.product_id = $1) AS stock,
             (SELECT count(*) FROM sale_items si JOIN product_variants v ON v.id = si.variant_id WHERE v.product_id = $1) AS ventas,
             (SELECT count(*) FROM purchase_order_items pi JOIN product_variants v ON v.id = pi.variant_id WHERE v.product_id = $1) AS compras,
             (SELECT count(*) FROM stock_movements sm JOIN product_variants v ON v.id = sm.variant_id WHERE v.product_id = $1) AS movimientos,
             (SELECT count(*) FROM stock_units su WHERE su.product_id = $1) AS bultos,
             (SELECT count(*) FROM product_essences pe WHERE pe.product_id = $1 OR pe.essence_variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)) AS recetas`,
          [id],
        );
        const vacio = Object.values(uso).every((v) => Number(v) === 0);
        const esLaUltima = g.ids.indexOf(id) === g.ids.length - 1;
        const conStock = Number(uso.stock) > 0;
        // Tres destinos: una copia sin uso se borra; una sin stock pero con
        // historial se **inactiva** (desaparece del POS y del catálogo, su
        // historial se queda); una con stock no se toca acá: hay que pasar
        // esas unidades a la que sobrevive por el ledger (ajuste de salida y
        // de entrada desde la app) y luego inactivarla, y eso se dice en vez
        // de hacerse a ciegas.
        const destino = esLaUltima
          ? 'sobrevive'
          : vacio
            ? 'SIN USO → se borra'
            : conStock
              ? 'CON STOCK → trasladar sus unidades a la que sobrevive y luego inactivar'
              : 'con historial, sin stock → se inactiva';
        console.log(
          `  ${g.name} ${id.slice(0, 8)}: ${destino} ${JSON.stringify(uso)}`,
        );
        if (!aplicar || esLaUltima || conStock) continue;
        if (vacio) {
          await ds.transaction(async (m) => {
            await m.query(
              `DELETE FROM stock WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)`,
              [id],
            );
            await m.query(
              `DELETE FROM product_variants WHERE product_id = $1`,
              [id],
            );
            await m.query(
              `DELETE FROM products WHERE id = $1 AND tenant_id = $2`,
              [id, t],
            );
          });
        } else {
          await ds.query(
            `UPDATE products SET status = 'INACTIVE', is_published = false, is_available = false WHERE id = $1 AND tenant_id = $2`,
            [id, t],
          );
        }
      }
    }
    if (!aplicar)
      console.log(
        '\nEnsayo: nada se escribió. Repite con MODE=apply para aplicar.',
      );
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
