/**
 * Importador de migración: AMAWAD (demachine) -> MiPinta.
 *
 * Lee migracion-amawad/out/payload.json (generado por extract.py) y crea
 * de forma IDEMPOTENTE en MiPinta:
 *   - Tenant "amawad" + StoreSettings
 *   - Bodega(s) (Warehouse) — AMAWAD tiene 1
 *   - Staff (User) a partir de los usuarios de demachine
 *   - Productos (con columna `brand`), variantes (talla/color) y stock por bodega
 *
 * Idempotencia: productos por `sourceRef` = "demachine:amawad:<id>";
 * tenant/bodegas/usuarios por sus claves naturales. Correrlo dos veces no duplica.
 *
 * Precios: se cargan TAL CUAL vienen de demachine (65 -> $65), por decisión
 * del cliente. Si algún día se quieren en miles, multiplicar base_price aquí.
 *
 * Uso:
 *   nest build && node dist/seeds/import-amawad.js                  # usa .env (¡PROD!)
 *   DB_HOST=localhost DB_USERNAME=dylanbc1 DB_PASSWORD= DB_DATABASE=ropa_pos \
 *     node dist/seeds/import-amawad.js                              # prueba local
 *   DRY_RUN=1 node dist/seeds/import-amawad.js                      # no escribe, solo cuenta
 */
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Size } from '../catalogs/entities/size.entity.js';
import { Color } from '../catalogs/entities/color.entity.js';
import { CatalogCache } from './catalog-cache.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Role } from '../common/enums/role.enum.js';
import { Gender } from '../common/enums/gender.enum.js';
import { MovementType } from '../common/enums/movement-type.enum.js';

dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';
const TENANT_SLUG = 'amawad';
const TENANT_NAME = 'AMAWAD';
const SOURCE = 'demachine:amawad';
const DEFAULT_STAFF_PASSWORD = 'amawad123'; // temporal; que la cambien al entrar
// Correo del dueño -> se crea como ADMIN (los demás entran como COLABORADOR).
const OWNER_EMAIL = 'administrador@empresa.com';

interface PayloadVariant {
  size: string | null;
  color: string | null;
  stock: number;
}
interface PayloadStockRow {
  size: string | null;
  color: string | null;
  warehouse_id: string;
  warehouse: string;
  qty: number;
}
interface PayloadProduct {
  source_id: number;
  code: string | null;
  name: string;
  brand: string | null;
  gender: string;
  base_price: number;
  image_url: string | null;
  variants: PayloadVariant[];
  stock_by_warehouse: PayloadStockRow[];
}
interface PayloadStaff {
  id: number;
  name: string;
  email: string;
  role_id: number;
  status: number;
}
interface Payload {
  meta: any;
  warehouses: { source_id: string; name: string }[];
  brands: string[];
  products: PayloadProduct[];
  staff: PayloadStaff[];
  orders: any[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function genderOf(g: string): Gender {
  if (g === 'MUJER') return Gender.MUJER;
  if (g === 'HOMBRE') return Gender.HOMBRE;
  return Gender.UNISEX;
}

async function main() {
  const payloadPath =
    process.env.PAYLOAD_PATH ||
    path.resolve(
      process.cwd(),
      '..',
      'migracion-amawad',
      'out',
      'payload.json',
    );
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`No existe el payload: ${payloadPath}`);
  }
  const payload: Payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  console.log(`Payload: ${payloadPath}`);
  console.log(
    `  productos=${payload.products.length} bodegas=${payload.warehouses.length} staff=${payload.staff.length}`,
  );

  const host = process.env.DB_HOST || 'localhost';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const dataSource = new DataSource({
    type: 'postgres',
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'dylanbc1',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'ropa_pos',
    entities: [
      Tenant,
      User,
      Category,
      Product,
      ProductVariant,
      Warehouse,
      Stock,
      StockMovement,
      StoreSettings,
    ],
    synchronize: isLocal, // en local crea las columnas nuevas (brand, source_ref); en prod NO
    ...(!isLocal && { ssl: { rejectUnauthorized: false } }),
  });
  await dataSource.initialize();
  console.log(
    `Conectado a ${host}/${process.env.DB_DATABASE || 'ropa_pos'} (local=${isLocal}, dryRun=${DRY_RUN})`,
  );

  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);
  const productRepo = dataSource.getRepository(Product);
  const variantRepo = dataSource.getRepository(ProductVariant);
  const warehouseRepo = dataSource.getRepository(Warehouse);
  const stockRepo = dataSource.getRepository(Stock);
  const movementRepo = dataSource.getRepository(StockMovement);
  const settingsRepo = dataSource.getRepository(StoreSettings);

  const stats = {
    warehouses: 0,
    staff: 0,
    products: 0,
    variants: 0,
    stockRows: 0,
    skippedExisting: 0,
  };

  // ── 1. Tenant ──
  let tenant = await tenantRepo.findOne({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    tenant = tenantRepo.create({ name: TENANT_NAME, slug: TENANT_SLUG });
    if (!DRY_RUN) tenant = await tenantRepo.save(tenant);
    console.log(`Tenant creado: ${TENANT_NAME}`);
  } else {
    console.log(`Tenant ya existe: ${TENANT_NAME}`);
  }
  const tenantId = tenant.id;

  // ── 2. Bodegas ──  (mapa: warehouse_id de demachine -> Warehouse.id de MiPinta)
  const whMap = new Map<string, string>();
  let firstWarehouseId: string | undefined;
  for (const w of payload.warehouses) {
    let wh = await warehouseRepo.findOne({ where: { tenantId, name: w.name } });
    if (!wh) {
      wh = warehouseRepo.create({
        name: w.name,
        code: `AM${w.source_id}`,
        isPosLocation: true,
        isActive: true,
        tenantId,
      });
      if (!DRY_RUN) wh = await warehouseRepo.save(wh);
      stats.warehouses++;
      console.log(`  Bodega creada: ${w.name}`);
    }
    whMap.set(String(w.source_id), wh.id);
    if (w.name.toUpperCase().includes('PPAL') || !firstWarehouseId)
      firstWarehouseId = wh.id;
  }

  // ── 3. Staff -> Users ──
  const usedUsernames = new Set<string>();
  for (const s of payload.staff) {
    if (!s.email || s.email.endsWith('@demachine.co')) continue; // salta soporte interno
    const email = s.email.trim().toLowerCase();
    let user = await userRepo.findOne({ where: { tenantId, email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(DEFAULT_STAFF_PASSWORD, 10);
      const parts = (s.name || 'Staff').trim().split(/\s+/);
      // El dueño (OWNER_EMAIL) -> ADMIN (necesario para gestionar el tenant).
      // El resto del staff entra como COLABORADOR.
      const isOwner = email === OWNER_EMAIL.toLowerCase();
      // username para login (además del email): nombre de demachine normalizado,
      // único por tenant.
      const baseUsername =
        (s.name || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '') || email.split('@')[0];
      let username = baseUsername;
      let un = 1;
      while (
        usedUsernames.has(username) ||
        (await userRepo.findOne({ where: { tenantId, username } }))
      ) {
        un++;
        username = `${baseUsername}${un}`;
      }
      usedUsernames.add(username);
      user = userRepo.create({
        email,
        username,
        passwordHash,
        firstName: parts[0] || 'Staff',
        lastName: parts.slice(1).join(' ') || 'AMAWAD',
        role: isOwner ? Role.ADMIN : Role.COLABORADOR,
        isActive: s.status === 1,
        tenantId,
      });
      if (!DRY_RUN) user = await userRepo.save(user);
      stats.staff++;
      console.log(`  Usuario creado: ${email} (${user.role})`);
    }
  }

  // ── 4. Productos + variantes + stock ──  (transacción por producto)
  let barcodeCounter = 0;
  const stamp = Date.now().toString().slice(-6);
  const usedSkuPrefixes = new Set<string>();
  const usedSlugs = new Set<string>();
  const failures: { source_id: number; error: string }[] = [];
  const variantKey = (size: string | null, color: string | null) =>
    `${size || ''}|${color || ''}`;
  // Color/talla completos y normalizados para el SKU (evita colisiones de truncado).
  const skuPart = (s: string) =>
    (s || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 12) || 'NA';

  for (const p of payload.products) {
    const sourceRef = `${SOURCE}:${p.source_id}`;
    const existing = await productRepo.findOne({
      where: { tenantId, sourceRef },
    });
    if (existing) {
      stats.skippedExisting++;
      continue;
    }

    // skuPrefix único por tenant: `code` de demachine si existe; si no, AM<id>.
    let skuPrefix = p.code ? `${p.code}` : `AM${p.source_id}`;
    let n = 1;
    while (
      usedSkuPrefixes.has(skuPrefix) ||
      (await productRepo.findOne({ where: { tenantId, skuPrefix } }))
    ) {
      n++;
      skuPrefix = `${p.code || 'AM' + p.source_id}-${n}`;
    }
    usedSkuPrefixes.add(skuPrefix);
    // slug único por tenant
    const baseSlug = slugify(p.name) || `producto-${p.source_id}`;
    let slug = baseSlug;
    let sn = 1;
    while (
      usedSlugs.has(slug) ||
      (await productRepo.findOne({ where: { tenantId, slug } }))
    ) {
      sn++;
      slug = `${baseSlug}-${sn}`;
    }
    usedSlugs.add(slug);

    if (DRY_RUN) {
      stats.products++;
      stats.variants += p.variants.length;
      continue;
    }

    try {
      await dataSource.transaction(async (m) => {
        const catalog = new CatalogCache(m);
        const product = await m.getRepository(Product).save(
          m.getRepository(Product).create({
            name: p.name,
            skuPrefix,
            slug,
            basePrice: p.base_price || 0,
            costPrice: 0,
            gender: genderOf(p.gender),
            brand: p.brand || undefined,
            sourceRef,
            taxRate: 19,
            imageUrl: p.image_url || undefined,
            imageUrls: p.image_url ? [p.image_url] : [],
            isPublished: false,
            isAvailable: true,
            tenantId,
          }),
        );

        // variantes por (talla,color) — SKU único dentro del producto
        const variantIdByKey = new Map<string, string>();
        const skuSeen = new Set<string>();
        for (const v of p.variants) {
          let sku = `${skuPrefix}-${skuPart(v.size || '')}-${skuPart(v.color || '')}`;
          let k2 = 1;
          while (skuSeen.has(sku))
            sku = `${skuPrefix}-${skuPart(v.size || '')}-${skuPart(v.color || '')}-${++k2}`;
          skuSeen.add(sku);
          const barcode = `78${stamp}${String(barcodeCounter++).padStart(6, '0')}`;
          const variant = await m.getRepository(ProductVariant).save(
            m.getRepository(ProductVariant).create({
              productId: product.id,
              sku,
              sizeId: await catalog.sizeId(v.size, tenantId),
              colorId: await catalog.colorId(v.color, tenantId),
              barcode,
              isActive: true,
              tenantId,
            }),
          );
          variantIdByKey.set(variantKey(v.size, v.color), variant.id);
          stats.variants++;
        }

        // stock por (variante, bodega)
        const stockAgg = new Map<string, number>();
        for (const row of p.stock_by_warehouse) {
          const vId = variantIdByKey.get(variantKey(row.size, row.color));
          const wId = whMap.get(String(row.warehouse_id));
          if (!vId || !wId) continue;
          const kk = `${vId}|${wId}`;
          stockAgg.set(kk, (stockAgg.get(kk) || 0) + (row.qty || 0));
        }
        for (const [kk, qty] of stockAgg) {
          const [variantId, warehouseId] = kk.split('|');
          await m.getRepository(Stock).save(
            m.getRepository(Stock).create({
              variantId,
              warehouseId,
              quantity: qty,
              minStock: 0,
              tenantId,
            }),
          );
          if (qty > 0) {
            await m.getRepository(StockMovement).save(
              m.getRepository(StockMovement).create({
                variantId,
                warehouseId,
                movementType: MovementType.IN,
                quantity: qty,
                referenceType: 'IMPORT_AMAWAD',
                notes: `Migración demachine ${sourceRef}`,
                tenantId,
              }),
            );
          }
          stats.stockRows++;
        }
      });
      stats.products++;
      if (stats.products % 50 === 0)
        console.log(`  … ${stats.products} productos`);
    } catch (e: any) {
      failures.push({ source_id: p.source_id, error: e?.message || String(e) });
      // liberar los identificadores reservados para no dejar huecos
      usedSkuPrefixes.delete(skuPrefix);
      usedSlugs.delete(slug);
      console.error(
        `  ✗ producto ${p.source_id} (${p.name}): ${e?.message || e}`,
      );
    }
  }
  if (failures.length)
    console.log(
      `\n⚠️  ${failures.length} productos fallaron:`,
      failures.slice(0, 10),
    );

  // ── 5. Store settings ──
  let settings = await settingsRepo.findOne({ where: { tenantId } });
  if (!settings) {
    settings = settingsRepo.create({
      storeName: TENANT_NAME,
      storeSlug: TENANT_SLUG,
      isStorefrontActive: false,
      defaultWarehouseId: firstWarehouseId,
      tenantId,
    });
    if (!DRY_RUN) await settingsRepo.save(settings);
    console.log('StoreSettings creado');
  }

  console.log('\n===== RESUMEN =====');
  console.log(JSON.stringify(stats, null, 2));
  console.log(
    DRY_RUN ? '(DRY_RUN: no se escribió nada)' : 'Importación completada.',
  );
  await dataSource.destroy();
}

main().catch((e) => {
  console.error('Import falló:', e);
  process.exit(1);
});
