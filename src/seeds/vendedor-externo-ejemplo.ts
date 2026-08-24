/**
 * Crea una cuenta de vendedor externo para probar el flujo.
 *
 * El caso: alguien que no tiene inventario propio pero vende mercancía de un
 * local. Entra como un usuario más de esa tienda, ve **solo las bodegas que se
 * le asignen**, y su venta queda esperando autorización — no descuenta
 * inventario hasta que alguien con mando la aprueba.
 *
 * Por defecto **no escribe nada**: enseña lo que haría. Para crearla:
 *
 *     MODE=apply TENANT=amawad BODEGA="Principal" node dist/seeds/vendedor-externo-ejemplo.js
 *
 * `TENANT` es el slug de la tienda. Si la base tiene más de una, **es
 * obligatorio**: sin él el script se niega en vez de adivinar, porque adivinar
 * mal significa meter un usuario ajeno en la tienda de otro cliente.
 *
 * `BODEGA` es la bodega a la que tendrá acceso. Acepta un nombre, varios
 * separados por coma, o `todas`. Sin ella usa la primera activa. La clave se
 * imprime **una sola vez**, al crearla; se puede fijar con `CLAVE`, y si no,
 * sale al azar.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../config/data-source.js';
import { findRoleTemplate } from '../access/role-templates.js';
import { escogerTienda, type Tienda } from './escoger-tienda.js';
import { escogerBodegas, type Bodega } from './escoger-bodegas.js';
import { rolAUsar } from './reusar-rol.js';
import { usaBodegas } from './usa-bodegas.js';

const CORREO = process.env.CORREO || 'vendedor.externo@ejemplo.co';
// Los dos perfiles de ventas ven lo mismo; el de «directo» además cobra.
const PLANTILLA =
  process.env.PERFIL === 'directo'
    ? 'vendedor-directo'
    : process.env.PERFIL === 'revendedor'
      ? 'revendedor'
      : 'vendedor-externo';

async function main() {
  const aplicar = process.env.MODE === 'apply';
  await AppDataSource.initialize();
  try {
    // `query` devuelve `any`: se envuelve una vez para no repetir el cast en
    // cada consulta ni dejarlo suelto.
    const consultar = async <T>(
      sql: string,
      params?: unknown[],
    ): Promise<T[]> => AppDataSource.query(sql, params);

    const tiendas = await consultar<Tienda>(
      `SELECT id, name, slug FROM tenants
        WHERE slug <> 'mipinta-platform' ORDER BY created_at`,
    );
    const tenant = escogerTienda(tiendas, process.env.TENANT);

    const plantilla = findRoleTemplate(PLANTILLA);
    if (!plantilla) throw new Error(`Falta la plantilla ${PLANTILLA}.`);

    const bodegas = await consultar<Bodega>(
      `SELECT id, name FROM warehouses
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY name`,
      [tenant.id],
    );
    // Al revendedor no se le asignan: no tiene bodega ni inventario.
    const conBodegas = usaBodegas(plantilla.permissions);
    const escogidas = conBodegas
      ? escogerBodegas(bodegas, process.env.BODEGA)
      : [];

    console.log(`Tienda:  ${tenant.name} (${tenant.slug})`);
    console.log(
      !conBodegas
        ? 'Bodegas: ninguna — este perfil no las usa'
        : escogidas === null
          ? `Bodegas: todas (${bodegas.length}), incluidas las que creen después`
          : `Bodegas: ${escogidas.map((b) => b.name).join(', ')} — y ninguna más`,
    );
    if (conBodegas && escogidas !== null && bodegas.length > escogidas.length) {
      console.log(
        `         no verá: ${bodegas
          .filter((b) => !escogidas.some((e) => e.id === b.id))
          .map((b) => b.name)
          .join(', ')} — se cambia con BODEGA="<nombre>" o BODEGA=todas`,
      );
    }
    console.log(`Correo:  ${CORREO}`);
    console.log(`Rol:     ${plantilla.name} — ${plantilla.description}`);

    const [yaEsta] = await consultar<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND tenant_id = $2`,
      [CORREO, tenant.id],
    );
    if (yaEsta) {
      console.log('\nEsa cuenta ya existe. No se toca.');
      return;
    }

    if (!aplicar) {
      console.log('\nENSAYO: no se escribió nada. Para crearla:');
      console.log(
        `  MODE=apply TENANT=${tenant.slug} node dist/seeds/vendedor-externo-ejemplo.js`,
      );
      return;
    }

    // Al azar por defecto: esta cuenta puede terminar en una tienda de verdad
    // y una clave escrita en el código es la misma para todos. `CLAVE` existe
    // para las cuentas de prueba, donde poder dictarla por teléfono importa
    // más que su fortaleza.
    const clave =
      process.env.CLAVE || `Ve-${randomBytes(6).toString('base64url')}`;
    await AppDataSource.transaction(async (m) => {
      // El rol es de la tienda, no del usuario: `access_roles` tiene
      // UNIQUE (tenant_id, name), así que el segundo vendedor externo de la
      // misma tienda comparte el del primero.
      const [yaHayRol]: { id: string }[] = await m.query(
        `SELECT id FROM access_roles WHERE tenant_id = $1 AND name = $2`,
        [tenant.id, plantilla.name],
      );
      const decision = rolAUsar(yaHayRol);
      let rolId = decision.id;
      if (decision.crear) {
        const [creado]: { id: string }[] = await m.query(
          `INSERT INTO access_roles (tenant_id, name, description)
           VALUES ($1, $2, $3) RETURNING id`,
          [tenant.id, plantilla.name, plantilla.description],
        );
        rolId = creado.id;
        for (const permiso of plantilla.permissions) {
          await m.query(
            `INSERT INTO role_permissions
               (tenant_id, role_id, module, can_list, can_create, can_edit, can_delete)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              tenant.id,
              rolId,
              permiso.module,
              permiso.list,
              permiso.create,
              permiso.edit,
              permiso.delete,
            ],
          );
        }
      }

      const [usuario]: { id: string }[] = await m.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, access_role_id)
         VALUES ($1, $2, $3, 'Vendedor', 'Externo', 'COLABORADOR', true, $4)
         RETURNING id`,
        [tenant.id, CORREO, await bcrypt.hash(clave, 10), rolId],
      );
      // Sin filas = sin restricción. Por eso «todas» no inserta nada en vez
      // de insertarlas una por una.
      for (const b of escogidas ?? []) {
        await m.query(
          `INSERT INTO user_warehouses (tenant_id, user_id, warehouse_id) VALUES ($1, $2, $3)`,
          [tenant.id, usuario.id, b.id],
        );
      }
    });

    console.log('\nCuenta creada.');
    console.log(`  correo: ${CORREO}`);
    console.log(`  clave:  ${clave}`);
    console.log('\nSe imprime una sola vez. Anótala o cámbiala al entrar.');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
