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
 * `BODEGA` es el nombre de la bodega a la que tendrá acceso; si no se pasa,
 * usa la primera activa. La clave se imprime **una sola vez**, al crearla; se
 * puede fijar con `CLAVE`, y si no, sale al azar.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../config/data-source.js';
import { findRoleTemplate } from '../access/role-templates.js';
import { escogerTienda, type Tienda } from './escoger-tienda.js';

const CORREO = process.env.CORREO || 'vendedor.externo@ejemplo.co';

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

    const bodegas = await consultar<{ id: string; name: string }>(
      `SELECT id, name FROM warehouses
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY name`,
      [tenant.id],
    );
    if (bodegas.length === 0) throw new Error('La tienda no tiene bodegas.');
    const bodega = process.env.BODEGA
      ? bodegas.find((b) => b.name === process.env.BODEGA)
      : bodegas[0];
    if (!bodega) {
      throw new Error(
        `No existe la bodega "${process.env.BODEGA}". Hay: ${bodegas.map((b) => b.name).join(', ')}`,
      );
    }

    const plantilla = findRoleTemplate('vendedor-externo');
    if (!plantilla) throw new Error('Falta la plantilla vendedor-externo.');

    console.log(`Tienda:  ${tenant.name} (${tenant.slug})`);
    console.log(`Bodega:  ${bodega.name} (la única que verá)`);
    if (bodegas.length > 1) {
      console.log(`         otras: ${bodegas
        .filter((b) => b.id !== bodega.id)
        .map((b) => b.name)
        .join(', ')} — se escogen con BODEGA="<nombre>"`);
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
    const clave = process.env.CLAVE || `Ve-${randomBytes(6).toString('base64url')}`;
    await AppDataSource.transaction(async (m) => {
      const [rol]: { id: string }[] = await m.query(
        `INSERT INTO access_roles (tenant_id, name, description)
         VALUES ($1, $2, $3) RETURNING id`,
        [tenant.id, plantilla.name, plantilla.description],
      );
      // La matriz se guarda con una columna por acción. Lo que importa acá:
      // `can_edit` en falso sobre cotizaciones es lo que impide que el
      // vendedor autorice su propia venta.
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
         VALUES ($1, $2, $3, 'Vendedor', 'Externo', 'COLABORADOR', true, $4)
         RETURNING id`,
        [tenant.id, CORREO, await bcrypt.hash(clave, 10), rol.id],
      );
      await m.query(
        `INSERT INTO user_warehouses (tenant_id, user_id, warehouse_id) VALUES ($1, $2, $3)`,
        [tenant.id, usuario.id, bodega.id],
      );
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
