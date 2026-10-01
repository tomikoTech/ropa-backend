/**
 * Dar de alta a un revendedor de verdad: su tienda, su rol y su cuenta.
 *
 * El revendedor es persona natural y **su propia tienda**, no un usuario
 * dentro de la de alguien: así su plata y sus ventas no se mezclan con las de
 * nadie. Tiene punto de venta de terceros, su libreta, sus clientes y sus
 * gastos; no tiene bodega, inventario, proveedores ni compras.
 *
 * Se diferencia de `revendedor-demo.js` en lo único que importa para una
 * cuenta real: **no siembra ventas de ejemplo**. Una cuenta de demostración
 * se quiere llena para mirarla; una de trabajo se quiere vacía.
 *
 * Entra con **usuario**, no con correo: en el mostrador nadie teclea un
 * correo veinte veces al día. El correo se guarda igual porque la cuenta lo
 * necesita, y sirve de respaldo para entrar.
 *
 * Por defecto **no escribe nada**: enseña lo que haría. Para crearla:
 *
 *     MODE=apply USUARIO=miami9 NOMBRE="Miami 9" node dist/seeds/crear-revendedor.js
 *
 * `CLAVE` fija la contraseña; sin ella sale una al azar y se imprime **una
 * sola vez**. `CORREO` fija el correo; sin él se arma con el usuario.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../config/data-source.js';
import { findRoleTemplate } from '../access/role-templates.js';
import {
  normalizarUsuario,
  porQueNoSirveElUsuario,
} from '../users/credenciales.js';
import { claveFacilYAleatoria } from './clave-facil.js';

const PLANTILLA = 'revendedor';

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const usuario = normalizarUsuario(process.env.USUARIO ?? '');
  const motivo = porQueNoSirveElUsuario(usuario);
  if (motivo) throw new Error(`USUARIO: ${motivo}`);

  const nombreTienda = process.env.NOMBRE?.trim() || usuario;
  const correo = process.env.CORREO?.trim() || `${usuario}@mipinta.app`;
  const slug = nombreTienda
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  await AppDataSource.initialize();
  try {
    const consultar = async <T>(sql: string, params?: unknown[]): Promise<T[]> =>
      AppDataSource.query(sql, params);

    const plantilla = findRoleTemplate(PLANTILLA);
    if (!plantilla) throw new Error(`Falta la plantilla ${PLANTILLA}.`);

    // Dos cuentas con el mismo usuario no podrían entrar: el login no sabría
    // a cuál de las dos. Se mira en **toda** la base y no solo en la tienda,
    // porque acá la tienda se está creando.
    const [choque] = await consultar<{ email: string }>(
      `SELECT email FROM users WHERE username = $1 OR email = $2`,
      [usuario, correo],
    );
    if (choque) {
      throw new Error(
        `Ya existe una cuenta con ese usuario o correo (${choque.email}). No se toca.`,
      );
    }
    const [tiendaExistente] = await consultar<{ slug: string }>(
      `SELECT slug FROM tenants WHERE slug = $1`,
      [slug],
    );
    if (tiendaExistente) {
      throw new Error(`Ya existe una tienda con el slug «${slug}». No se toca.`);
    }

    console.log(`Tienda nueva:  ${nombreTienda} (${slug})`);
    console.log(`Usuario:       ${usuario}`);
    console.log(`Correo:        ${correo}`);
    console.log(`Rol:           ${plantilla.name}`);
    console.log('Datos de ejemplo: ninguno (cuenta de trabajo)');

    if (!aplicar) {
      console.log('\nENSAYO: no se escribió nada. Para crearla:');
      console.log(
        `  MODE=apply USUARIO=${usuario} NOMBRE="${nombreTienda}" node dist/seeds/crear-revendedor.js`,
      );
      return;
    }

    const clave = process.env.CLAVE || claveFacilYAleatoria();
    await AppDataSource.transaction(async (m) => {
      const [tenant]: { id: string }[] = await m.query(
        `INSERT INTO tenants (name, slug, is_active) VALUES ($1, $2, true) RETURNING id`,
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
      await m.query(
        `INSERT INTO users
           (tenant_id, email, username, password_hash, first_name, last_name,
            role, is_active, access_role_id)
         VALUES ($1, $2, $3, $4, $5, '', 'COLABORADOR', true, $6)`,
        [
          tenant.id,
          correo,
          usuario,
          await bcrypt.hash(clave, 10),
          nombreTienda,
          rol.id,
        ],
      );
    });

    console.log('\nCuenta creada.');
    console.log(`  usuario: ${usuario}`);
    console.log(`  clave:   ${clave}`);
    console.log('  (se puede cambiar en Mi cuenta)');
    console.log('\nLa clave se imprime una sola vez.');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
