/**
 * Saca de una tienda la cuenta de revendedor que quedó dentro de ella.
 *
 * Antes de que el modelo quedara claro, un revendedor se creaba **dentro** de
 * una tienda. Hoy cada persona natural es su propio tenant. Las cuentas viejas
 * quedaron adentro, y sus ventas de tercero son —para la base de datos— ventas
 * de esa tienda: el administrador las ve, con nombres de proveedores y costos
 * que no son suyos. No es una fuga entre tiendas; es una cuenta sembrada en la
 * tienda equivocada. La diferencia importa, porque el arreglo es distinto.
 *
 * Borra solo lo que cuelga de **esa** cuenta:
 *   - sus ventas de tercero (`consignments.user_id`),
 *   - los renglones de la libreta que quedan sin ninguna venta detrás,
 *   - la cuenta, y su rol si no le quedó nadie.
 *
 * Lo que la tienda registró por su cuenta no se toca.
 *
 * Ensayo:    CORREO=x@y.co node dist/seeds/sacar-revendedor-de-la-tienda.js
 * Aplicar:   MODE=apply CONFIRM_TENANT=<slug> CORREO=x@y.co node dist/seeds/...
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';

const CORREO = process.env.CORREO;

async function main() {
  if (!CORREO) throw new Error('Falta CORREO=<correo de la cuenta>.');
  const aplicar = process.env.MODE === 'apply';

  await AppDataSource.initialize();
  try {
    const consultar = async <T>(sql: string, p?: unknown[]): Promise<T[]> =>
      AppDataSource.query(sql, p);

    const [cuenta] = await consultar<{
      id: string;
      tenant_id: string;
      slug: string;
      tienda: string;
      rol_id: string | null;
      rol: string | null;
    }>(
      `SELECT u.id, u.tenant_id, t.slug, t.name AS tienda,
              u.access_role_id AS rol_id, r.name AS rol
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN access_roles r ON r.id = u.access_role_id
        WHERE u.email = $1`,
      [CORREO],
    );
    if (!cuenta) {
      console.log(`No existe ninguna cuenta con el correo ${CORREO}.`);
      return;
    }

    const [{ n: ventas }] = await consultar<{ n: string }>(
      `SELECT count(*) n FROM consignments WHERE user_id = $1`,
      [cuenta.id],
    );

    // Renglones de la libreta que solo existen por las ventas de esta cuenta.
    const huerfanos = await consultar<{ id: string; producto: string }>(
      `SELECT p.id, p.third_party_name || ' · ' || p.product_description producto
         FROM third_party_products p
        WHERE p.tenant_id = $1
          AND EXISTS (SELECT 1 FROM consignments c
                       WHERE c.user_id = $2
                         AND c.third_party_name = p.third_party_name
                         AND c.product_description = p.product_description)
          AND NOT EXISTS (SELECT 1 FROM consignments c
                           WHERE c.tenant_id = p.tenant_id
                             AND c.user_id IS DISTINCT FROM $2
                             AND c.third_party_name = p.third_party_name
                             AND c.product_description = p.product_description)`,
      [cuenta.tenant_id, cuenta.id],
    );

    console.log(`Cuenta:  ${CORREO}`);
    console.log(`Tienda:  ${cuenta.tienda} (${cuenta.slug})`);
    console.log(`Rol:     ${cuenta.rol ?? '(sin rol)'}`);
    console.log(`Ventas de tercero suyas:      ${ventas}`);
    console.log(`Renglones de libreta a sacar: ${huerfanos.length}`);
    for (const h of huerfanos.slice(0, 15)) console.log(`  - ${h.producto}`);
    if (huerfanos.length > 15) console.log(`  ... y ${huerfanos.length - 15} más`);

    if (!aplicar) {
      console.log('\nENSAYO: no se escribió nada. Para aplicarlo:');
      console.log(
        `  MODE=apply CONFIRM_TENANT=${cuenta.slug} CORREO=${CORREO} \\\n    node dist/seeds/sacar-revendedor-de-la-tienda.js`,
      );
      return;
    }
    if (process.env.CONFIRM_TENANT !== cuenta.slug) {
      throw new Error(
        `Para aplicar hay que confirmar la tienda: CONFIRM_TENANT=${cuenta.slug}`,
      );
    }

    await AppDataSource.transaction(async (m) => {
      if (huerfanos.length) {
        await m.query(`DELETE FROM third_party_products WHERE id = ANY($1)`, [
          huerfanos.map((h) => h.id),
        ]);
      }
      await m.query(`DELETE FROM consignments WHERE user_id = $1`, [cuenta.id]);
      await m.query(`DELETE FROM user_warehouses WHERE user_id = $1`, [
        cuenta.id,
      ]);
      await m.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [
        cuenta.id,
      ]);
      await m.query(`DELETE FROM users WHERE id = $1`, [cuenta.id]);

      if (cuenta.rol_id) {
        const [{ n }]: { n: string }[] = await m.query(
          `SELECT count(*) n FROM users WHERE access_role_id = $1`,
          [cuenta.rol_id],
        );
        if (Number(n) === 0) {
          await m.query(`DELETE FROM role_permissions WHERE role_id = $1`, [
            cuenta.rol_id,
          ]);
          await m.query(`DELETE FROM access_roles WHERE id = $1`, [
            cuenta.rol_id,
          ]);
          console.log(`Rol "${cuenta.rol}" borrado: no le quedó nadie.`);
        }
      }
    });

    console.log('\nListo. La tienda vuelve a ver solo lo suyo.');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
