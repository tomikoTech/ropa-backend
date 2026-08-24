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
import { claveDeProducto } from '../consignments/producto-de-tercero.js';

const CORREO = process.env.CORREO || 'revendedor.demo@ejemplo.co';
const PLANTILLA = 'revendedor';

/**
 * Lo que un revendedor de calzado vende en una semana normal.
 *
 * Se repiten pares a proposito —la misma referencia en dos tallas, y una
 * vendida dos veces— para que la libreta enseñe lo que hace: agrupar y
 * recordar el ultimo precio.
 */
const VENTAS = [
  ['Don Jose', 'Nike Air Force 1', '40', 'Blanco', 95000, 150000, 'EFECTIVO'],
  ['Don Jose', 'Nike Air Force 1', '42', 'Blanco', 95000, 150000, 'EFECTIVO'],
  [
    'Don Jose',
    'Nike Air Force 1',
    '40',
    'Blanco',
    98000,
    155000,
    'TRANSFERENCIA',
  ],
  ['Don Jose', 'Adidas Superstar', '41', 'Negro', 88000, 140000, 'EFECTIVO'],
  ['Marcela', 'Puma Suede', '38', 'Azul', 72000, 120000, 'EFECTIVO'],
  ['Marcela', 'Puma Suede', '39', 'Azul', 72000, 120000, 'TRANSFERENCIA'],
  ['Marcela', 'Sandalia Ipanema', '37', 'Rosado', 28000, 55000, 'EFECTIVO'],
  ['El Primo', 'Nike Dunk Low', '43', 'Verde', 130000, 195000, 'EFECTIVO'],
  ['El Primo', 'Nike Dunk Low', '41', 'Verde', 130000, 190000, 'EFECTIVO'],
  ['El Primo', 'Crocs Clasico', '40', 'Negro', 60000, 98000, 'EFECTIVO'],
] as const;

/** Cuantos dias atras cae cada venta, para que el historial no sea de un dia. */
const DIAS_ATRAS = [0, 0, 1, 1, 2, 3, 3, 5, 6, 6];

/** Cuales quedan sin cobrarle al cliente o sin pagarle al dueno. */
const SIN_COBRAR = new Set([2, 7]);
const SIN_PAGAR = new Set([0, 4, 8]);

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

      // Las ventas, y la libreta que sale de ellas.
      const libreta = new Map<
        string,
        { costo: number; precio: number; veces: number; fecha: Date }
      >();
      for (let i = 0; i < VENTAS.length; i++) {
        const [duenyo, descripcion, talla, color, costo, precio, metodo] =
          VENTAS[i];
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - DIAS_ATRAS[i]);
        await m.query(
          `INSERT INTO consignments
             (tenant_id, user_id, third_party_name, product_description, size, color,
              quantity, cost_price, sale_price, client_name, client_paid, supplier_paid,
              payment_method, sale_date)
           VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,'',$9,$10,$11,$12)`,
          [
            tenant.id,
            usuario.id,
            duenyo,
            descripcion,
            talla,
            color,
            costo,
            precio,
            !SIN_COBRAR.has(i),
            !SIN_PAGAR.has(i),
            metodo,
            fecha,
          ],
        );
        const clave = claveDeProducto({
          thirdPartyName: duenyo,
          productDescription: descripcion,
          size: talla,
          color,
        });
        const previo = libreta.get(clave);
        libreta.set(clave, {
          costo,
          precio,
          veces: (previo?.veces ?? 0) + 1,
          fecha,
        });
      }
      for (const [clave, d] of libreta) {
        const [duenyo, descripcion, talla, color] = clave.split('\u0001');
        const original = VENTAS.find(
          (v) =>
            v[0].toLowerCase() === duenyo && v[1].toLowerCase() === descripcion,
        )!;
        await m.query(
          `INSERT INTO third_party_products
             (tenant_id, clave, third_party_name, product_description, size, color,
              last_cost_price, last_sale_price, times_sold, last_sold_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tenant.id,
            clave,
            original[0],
            original[1],
            talla,
            color ? original[3] : '',
            d.costo,
            d.precio,
            d.veces,
            d.fecha,
          ],
        );
      }
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
