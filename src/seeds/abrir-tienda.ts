/**
 * Abrir una tienda nueva, con su inventario inicial, de una sola pasada.
 *
 * Un cliente nuevo llega con dos cosas: un correo para entrar y una lista de
 * WhatsApp con lo que tiene en bodega. Hasta ahora eso se armaba a mano —crear
 * el tenant, el admin, la bodega, las categorías, y después teclear producto
 * por producto— y cada paso era una ocasión de equivocarse en la tienda de
 * alguien más.
 *
 * Por defecto **no escribe nada**: imprime lo que haría y se calla. Y si el
 * correo o el slug ya existen, se niega en vez de mezclar: meterle productos a
 * la tienda equivocada no se deshace con un ctrl+z.
 *
 *     NOMBRE="La Bodega AG" CORREO=labodegag@gmail.com CLAVE=<clave> \
 *       LISTA=src/seeds/listas/la-bodega-ag.txt \
 *       node dist/seeds/abrir-tienda.js
 *
 * Con `MODE=apply` escribe.
 *
 * Lo que la lista **no** trae —precios y costos— queda en cero a propósito.
 * Inventar un precio es meterle plata falsa a la contabilidad del cliente; un
 * cero se ve de una y se corrige en la pantalla de productos.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../config/data-source.js';
import { leerLista, generoPorElNombre } from './renglon-de-inventario.js';

const NOMBRE = process.env.NOMBRE || '';
const CORREO = process.env.CORREO || '';
const LISTA = process.env.LISTA || '';
const BODEGA = process.env.BODEGA || 'Principal';
const CATEGORIA_SUELTA = 'General';

function aSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `Camiseta Texturizada` → `CAMISE`. Los choques los resuelve quien llama. */
function prefijo(nombre: string): string {
  const base = nombre
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  return base || 'PROD';
}

/** Un valor libre dentro de los ya usados, con sufijo numérico. */
function libre(base: string, usados: Set<string>, separador = ''): string {
  if (!usados.has(base)) {
    usados.add(base);
    return base;
  }
  let n = 2;
  while (usados.has(`${base}${separador}${n}`)) n++;
  const elegido = `${base}${separador}${n}`;
  usados.add(elegido);
  return elegido;
}

async function main() {
  const aplicar = process.env.MODE === 'apply';

  if (!NOMBRE) throw new Error('Falta NOMBRE="<nombre de la tienda>".');
  if (!CORREO) throw new Error('Falta CORREO=<correo del administrador>.');

  const slug = process.env.SLUG || aSlug(NOMBRE);
  const lectura = LISTA
    ? leerLista(readFileSync(LISTA, 'utf8'))
    : { renglones: [], ilegibles: [] };

  // Un renglón que no se entendió para la carga entera. Cargar 17 de 18
  // productos sin avisar deja al cliente cuadrando un inventario que nunca
  // estuvo completo, y sin saber por dónde empezar a buscar.
  if (lectura.ilegibles.length) {
    console.error('\nNo entendí estos renglones de la lista:');
    for (const l of lectura.ilegibles) console.error(`  · ${l}`);
    throw new Error('Arregla la lista y vuelve a correr. No se escribió nada.');
  }

  const categorias = [
    ...new Set(
      lectura.renglones.map((r) => r.categoria ?? CATEGORIA_SUELTA),
    ),
  ];
  const unidades = lectura.renglones.reduce((s, r) => s + r.cantidad, 0);

  await AppDataSource.initialize();
  try {
    console.log(`Tienda:  ${NOMBRE}  (${slug})`);
    console.log(`Admin:   ${CORREO}`);
    console.log(`Bodega:  ${BODEGA}`);
    console.log(`Categorías (${categorias.length}): ${categorias.join(', ')}`);
    console.log(
      `Productos: ${lectura.renglones.length}   Unidades: ${unidades}`,
    );
    console.log('');
    for (const r of lectura.renglones) {
      console.log(
        `  ${String(r.cantidad).padStart(5)}  ${r.nombre.padEnd(28)} ${(r.categoria ?? CATEGORIA_SUELTA).padEnd(14)} ${generoPorElNombre(r.nombre)}`,
      );
    }

    const choques: { id: string }[] = await AppDataSource.query(
      `SELECT id FROM tenants WHERE slug = $1
       UNION ALL SELECT id FROM users WHERE email = $2`,
      [slug, CORREO],
    );
    if (choques.length) {
      console.log(
        `\nYa existe una tienda con el slug «${slug}» o un usuario con ese correo. No se toca nada.`,
      );
      return;
    }

    if (!aplicar) {
      console.log('\nENSAYO: no se escribió nada. Para crearla, MODE=apply.');
      return;
    }

    const clave = process.env.CLAVE;
    if (!clave) throw new Error('Falta CLAVE=<contraseña del administrador>.');

    await AppDataSource.transaction(async (m) => {
      const [tenant]: { id: string }[] = await m.query(
        `INSERT INTO tenants (name, slug, is_active) VALUES ($1, $2, true) RETURNING id`,
        [NOMBRE, slug],
      );
      const tenantId = tenant.id;

      const [bodega]: { id: string }[] = await m.query(
        `INSERT INTO warehouses (tenant_id, name, code, address, is_pos_location, is_active)
         VALUES ($1, $2, $3, '', true, true) RETURNING id`,
        [tenantId, BODEGA, `${prefijo(NOMBRE)}-01`],
      );

      await m.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active)
         VALUES ($1, $2, $3, 'Administrador', $4, 'ADMIN', true)`,
        [tenantId, CORREO, await bcrypt.hash(clave, 10), NOMBRE],
      );

      await m.query(
        `INSERT INTO clients (tenant_id, first_name, last_name, document_type, document_number, is_generic, is_active)
         VALUES ($1, 'Consumidor', 'Final', 'CC', '0000000000', true, true)`,
        [tenantId],
      );

      const idDeCategoria = new Map<string, string>();
      for (const [i, nombre] of categorias.entries()) {
        const [cat]: { id: string }[] = await m.query(
          `INSERT INTO categories (tenant_id, name, slug, sort_order, is_active, type)
           VALUES ($1, $2, $3, $4, true, 'STANDARD') RETURNING id`,
          [tenantId, nombre, aSlug(nombre), i + 1],
        );
        idDeCategoria.set(nombre, cat.id);
      }

      await m.query(
        `INSERT INTO store_settings
           (tenant_id, store_name, store_slug, default_warehouse_id, is_storefront_active, unit_tracking_enabled)
         VALUES ($1, $2, $3, $4, false, false)`,
        [tenantId, NOMBRE, slug, bodega.id],
      );

      // Los códigos se calculan en memoria porque la tienda nace vacía: no hay
      // nada contra qué chocar salvo lo que esta misma carga vaya creando.
      const prefijos = new Set<string>();
      const slugs = new Set<string>();
      const skus = new Set<string>();
      const sello = Date.now().toString().slice(-8);
      let n = 0;

      // Una sola talla, «Única», para toda la carga: la lista no trae tallas ni
      // colores. Cuando el cliente las mande se añaden variantes al producto;
      // no hay que rehacerlo.
      const [talla]: { id: string }[] = await m.query(
        `INSERT INTO sizes (tenant_id, name, sort_order, is_active)
         VALUES ($1, 'Única', 0, true) RETURNING id`,
        [tenantId],
      );

      for (const r of lectura.renglones) {
        const nombreCat = r.categoria ?? CATEGORIA_SUELTA;
        const skuPrefix = libre(prefijo(r.nombre), prefijos);
        const [producto]: { id: string }[] = await m.query(
          `INSERT INTO products
             (tenant_id, name, sku_prefix, slug, base_price, cost_price, gender,
              category_id, tax_rate, is_published, image_urls)
           VALUES ($1, $2, $3, $4, 0, 0, $5, $6, 0, false, '{}') RETURNING id`,
          [
            tenantId,
            r.nombre,
            skuPrefix,
            libre(aSlug(r.nombre), slugs, '-'),
            generoPorElNombre(r.nombre),
            idDeCategoria.get(nombreCat),
          ],
        );

        const [variante]: { id: string }[] = await m.query(
          `INSERT INTO product_variants
             (tenant_id, product_id, sku, size_id, barcode, is_active)
           VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
          [
            tenantId,
            producto.id,
            libre(`${skuPrefix}-UNICA`, skus, '-'),
            talla.id,
            `78${sello}${String(n++).padStart(4, '0')}`,
          ],
        );

        // ledger-exento: el seed carga el saldo con el que arranca la tienda,
        // no mueve inventario de una operación.
        await m.query(
          `INSERT INTO stock (tenant_id, variant_id, warehouse_id, quantity, min_stock)
           VALUES ($1, $2, $3, $4, 0)`,
          [tenantId, variante.id, bodega.id, r.cantidad],
        );
        await m.query(
          `INSERT INTO stock_movements
             (tenant_id, variant_id, warehouse_id, movement_type, quantity, reference_type, notes)
           VALUES ($1, $2, $3, 'IN', $4, 'SEED', $5)`,
          [tenantId, variante.id, bodega.id, r.cantidad, `Inventario inicial: ${r.crudo}`],
        );
      }
    });

    console.log('\nTienda creada.');
    console.log(`  correo: ${CORREO}`);
    console.log(`  clave:  ${clave}`);
    console.log(
      '\nLos precios quedaron en cero: hay que ponerlos antes de vender.',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
