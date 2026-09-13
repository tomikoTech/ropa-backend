/**
 * Deja la cuenta de demostración del revendedor como nueva.
 *
 * Después de enseñarla, la cuenta queda con ventas de prueba, clientes
 * inventados y gastos a medias, y la siguiente demostración empieza con
 * basura. Este script borra **lo que el negocio registró** —ventas de
 * tercero, sus abonos, la libreta, los gastos, la caja menor, los clientes,
 * las notificaciones— y vuelve a sembrar los mismos datos de ejemplo con que
 * nace la cuenta (`revendedor-demo-datos.ts`). El usuario, su clave y su
 * tienda se quedan.
 *
 * También pone al día los permisos del rol con la plantilla actual: una cuenta
 * creada antes de que el revendedor tuviera Gastos veía «Egresos» en el menú y
 * un 403 al entrar.
 *
 * Solo trabaja sobre una cuenta que sea **de demostración de verdad**: el
 * único usuario de su tienda y con el rol de revendedor. Si la tienda tiene
 * más gente, o el rol es otro, se niega: no hay forma de borrar por accidente
 * el negocio de una persona real.
 *
 * Ensayo:   CORREO=demo@ejemplo.co node dist/seeds/reiniciar-revendedor-demo.js
 * Aplicar:  MODE=apply CONFIRM_TENANT=<slug> CORREO=demo@ejemplo.co node dist/seeds/reiniciar-revendedor-demo.js
 * Vacía:    ... VACIA=1 → borra y no siembra nada: la cuenta queda en cero,
 *           para una demostración que empieza desde la primera venta.
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import { findRoleTemplate } from '../access/role-templates.js';
import { sembrarDatosDeDemo } from './revendedor-demo-datos.js';

const CORREO = process.env.CORREO;
const PLANTILLA = 'revendedor';

/** Lo que se borra, en el orden en que las llaves foráneas lo permiten. */
const TABLAS = [
  'consignment_payments',
  'consignments',
  'third_party_products',
  'expenses',
  'petty_cash',
  'notifications',
  'audit_logs',
  'clients',
];

async function main() {
  if (!CORREO) throw new Error('Falta CORREO=<correo de la cuenta demo>.');
  const aplicar = process.env.MODE === 'apply';
  const plantilla = findRoleTemplate(PLANTILLA);
  if (!plantilla) throw new Error(`Falta la plantilla ${PLANTILLA}.`);

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
      plantilla: string | null;
    }>(
      `SELECT u.id, u.tenant_id, t.slug, t.name AS tienda, u.access_role_id AS rol_id,
              r.template_key AS plantilla
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN access_roles r ON r.id = u.access_role_id
        WHERE u.email = $1`,
      [CORREO],
    );
    if (!cuenta) throw new Error(`No hay ninguna cuenta con el correo ${CORREO}.`);
    if (cuenta.plantilla !== PLANTILLA) {
      throw new Error(
        `La cuenta ${CORREO} no es de revendedor (rol: ${cuenta.plantilla ?? 'sin rol'}). No se toca.`,
      );
    }
    const [{ n: usuarios }] = await consultar<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM users WHERE tenant_id = $1`,
      [cuenta.tenant_id],
    );
    if (Number(usuarios) !== 1) {
      throw new Error(
        `La tienda ${cuenta.slug} tiene ${usuarios} usuarios: no parece una cuenta de demostración. No se toca.`,
      );
    }

    console.log(`Tienda:  ${cuenta.tienda} (${cuenta.slug})`);
    console.log(`Cuenta:  ${CORREO}`);
    console.log('\nSe borraría:');
    for (const tabla of TABLAS) {
      const [{ n }] = await consultar<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM ${tabla} WHERE tenant_id = $1`,
        [cuenta.tenant_id],
      );
      console.log(`  ${tabla.padEnd(22)} ${n}`);
    }

    if (!aplicar) {
      console.log('\nENSAYO: no se escribió nada. Para aplicar:');
      console.log(
        `  MODE=apply CONFIRM_TENANT=${cuenta.slug} CORREO=${CORREO} node dist/seeds/reiniciar-revendedor-demo.js`,
      );
      return;
    }
    if (process.env.CONFIRM_TENANT !== cuenta.slug) {
      throw new Error(
        `CONFIRM_TENANT tiene que ser exactamente "${cuenta.slug}" para aplicar.`,
      );
    }

    const sembrado = await AppDataSource.transaction(async (m) => {
      for (const tabla of TABLAS) {
        await m.query(`DELETE FROM ${tabla} WHERE tenant_id = $1`, [cuenta.tenant_id]);
      }
      // Los permisos, como dice la plantilla hoy.
      if (cuenta.rol_id) {
        await m.query(`DELETE FROM role_permissions WHERE role_id = $1`, [cuenta.rol_id]);
        for (const permiso of plantilla.permissions) {
          await m.query(
            `INSERT INTO role_permissions
               (tenant_id, role_id, module, can_list, can_create, can_edit, can_delete)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [cuenta.tenant_id, cuenta.rol_id, permiso.module, permiso.list,
              permiso.create, permiso.edit, permiso.delete],
          );
        }
      }
      if (process.env.VACIA === '1') return null;
      return sembrarDatosDeDemo(m, cuenta.tenant_id, cuenta.id);
    });

    console.log(
      sembrado
        ? `\nListo: cuenta como nueva, con ${sembrado.ventas} ventas y ${sembrado.gastos} gastos de ejemplo.`
        : '\nListo: cuenta vacía, en cero.',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
