/**
 * Una cuenta de revendedor lista para mirar, con datos de ejemplo.
 *
 * El revendedor es persona natural: **su propia tienda**, no un usuario dentro
 * de la de alguien. Compra al detal y revende, no tiene bodega ni inventario,
 * y todo lo que vende es de un tercero.
 *
 * Este seed deja la cuenta con ventas ya hechas para que se pueda ver de
 * entrada la libreta llena y la contabilidad con numeros: una cuenta vacia no
 * enseña nada.
 *
 * Por defecto **no escribe nada**:
 *
 *     MODE=apply CORREO=demo@ejemplo.co CLAVE=<clave> node dist/seeds/revendedor-demo.js
 *
 * `TIENDA` es el nombre de la tienda nueva (por defecto, el correo).
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../config/data-source.js';
import { findRoleTemplate } from '../access/role-templates.js';
import { sembrarDatosDeDemo, VENTAS } from './revendedor-demo-datos.js';

const CORREO = process.env.CORREO || 'revendedor.demo@ejemplo.co';
const PLANTILLA = 'revendedor';

async function main() {
  const aplicar = process.env.MODE === 'apply';
  await AppDataSource.initialize();
  try {
    const consultar = async <T>(
      sql: string,
      params?: unknown[],
    ): Promise<T[]> => AppDataSource.query(sql, params);

    const plantilla = findRoleTemplate(PLANTILLA);
    if (!plantilla) throw new Error(`Falta la plantilla ${PLANTILLA}.`);

    const nombreTienda = process.env.TIENDA || CORREO.split('@')[0];
    const slug = nombreTienda
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const [yaHayUsuario] = await consultar<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [CORREO],
    );

    console.log(`Tienda propia: ${nombreTienda} (${slug})`);
    console.log(`Correo:        ${CORREO}`);
    console.log(`Rol:           ${plantilla.name}`);
    console.log(`Ventas de ejemplo: ${VENTAS.length}`);

    if (yaHayUsuario) {
      console.log('\nEse correo ya existe. No se toca.');
      return;
    }
    if (!aplicar) {
      console.log('\nENSAYO: no se escribió nada. Para crearla:');
      console.log(
        `  MODE=apply CORREO=${CORREO} node dist/seeds/revendedor-demo.js`,
      );
      return;
    }

    const clave =
      process.env.CLAVE || `Re-${randomBytes(6).toString('base64url')}`;
    await AppDataSource.transaction(async (m) => {
      const [tenant]: { id: string }[] = await m.query(
        `INSERT INTO tenants (name, slug, is_active) VALUES ($1, $2, true)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [nombreTienda, slug],
      );
      const [rol]: { id: string }[] = await m.query(
        `INSERT INTO access_roles (tenant_id, name, description, template_key)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenant.id, plantilla.name, plantilla.description, PLANTILLA],
      );
      for (const permiso of plantilla.permissions) {
        await m.query(
          `INSERT INTO role_permissions
             (tenant_id, role_id, module, can_list, can_create, can_edit, can_delete)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenant.id,
            rol.id,
            permiso.module,
            permiso.list,
            permiso.create,
            permiso.edit,
            permiso.delete,
          ],
        );
      }
      const [usuario]: { id: string }[] = await m.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, access_role_id)
         VALUES ($1, $2, $3, 'Revendedor', 'Demo', 'COLABORADOR', true, $4)
         RETURNING id`,
        [tenant.id, CORREO, await bcrypt.hash(clave, 10), rol.id],
      );

      await sembrarDatosDeDemo(m, tenant.id, usuario.id);
    });

    console.log('\nCuenta creada, con datos para mirar.');
    console.log(`  correo: ${CORREO}`);
    console.log(`  clave:  ${clave}`);
    console.log('\nSe imprime una sola vez.');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
