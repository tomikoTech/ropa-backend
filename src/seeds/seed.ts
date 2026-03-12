import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Payment } from '../pos/entities/payment.entity.js';
import { AccountsReceivable } from '../pos/entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from '../pos/entities/accounts-receivable-payment.entity.js';
import { Supplier } from '../suppliers/entities/supplier.entity.js';
import { PurchaseOrder } from '../purchases/entities/purchase-order.entity.js';
import { PurchaseOrderItem } from '../purchases/entities/purchase-order-item.entity.js';
import { AccountsPayable } from '../purchases/entities/accounts-payable.entity.js';
import { Promotion } from '../promotions/entities/promotion.entity.js';
import { Return } from '../returns/entities/return.entity.js';
import { ReturnItem } from '../returns/entities/return-item.entity.js';
import { CreditNote } from '../returns/entities/credit-note.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from '../storefront/entities/ecommerce-order-item.entity.js';
import { Role } from '../common/enums/role.enum.js';
import { Gender } from '../common/enums/gender.enum.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { DocumentType } from '../common/enums/document-type.enum.js';
import * as dotenv from 'dotenv';

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME || 'dylanbc1',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'ropa_pos',
  entities: [
    Tenant,
    User,
    RefreshToken,
    Category,
    Product,
    ProductVariant,
    Warehouse,
    Stock,
    StockMovement,
    Client,
    Sale,
    SaleItem,
    Payment,
    AccountsReceivable,
    AccountsReceivablePayment,
    Supplier,
    PurchaseOrder,
    PurchaseOrderItem,
    AccountsPayable,
    Promotion,
    Return,
    ReturnItem,
    CreditNote,
    AuditLog,
    StoreSettings,
    EcommerceOrder,
    EcommerceOrderItem,
  ],
  synchronize: true,
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function seed() {
  await dataSource.initialize();
  console.log('Database connected');

  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);
  const categoryRepo = dataSource.getRepository(Category);
  const productRepo = dataSource.getRepository(Product);
  const variantRepo = dataSource.getRepository(ProductVariant);
  const warehouseRepo = dataSource.getRepository(Warehouse);
  const stockRepo = dataSource.getRepository(Stock);
  const stockMovementRepo = dataSource.getRepository(StockMovement);
  const clientRepo = dataSource.getRepository(Client);
  const settingsRepo = dataSource.getRepository(StoreSettings);

  // ═══════════════════════════════════════════
  // 1. Platform Tenant (for Super Admin)
  // ═══════════════════════════════════════════
  let platformTenant = await tenantRepo.findOne({ where: { slug: 'mipinta-platform' } });
  if (!platformTenant) {
    platformTenant = await tenantRepo.save(
      tenantRepo.create({ name: 'MiPinta Platform', slug: 'mipinta-platform' }),
    );
    console.log('Platform tenant created: MiPinta Platform');
  } else {
    console.log('Platform tenant already exists');
  }

  // ═══════════════════════════════════════════
  // 2. Super Admin User
  // ═══════════════════════════════════════════
  let superAdmin = await userRepo.findOne({ where: { email: 'dyez1110@gmail.com' } });
  if (!superAdmin) {
    const passwordHash = await bcrypt.hash('supermario123', 10);
    superAdmin = await userRepo.save(
      userRepo.create({
        email: 'dyez1110@gmail.com',
        passwordHash,
        firstName: 'Dylan',
        lastName: 'Admin',
        role: Role.SUPER_ADMIN,
        isActive: true,
        tenantId: platformTenant.id,
      }),
    );
    console.log('Super Admin created: dyez1110@gmail.com');
  } else {
    console.log('Super Admin already exists');
  }

  // ═══════════════════════════════════════════
  // 3. Tu Chapato Store
  // ═══════════════════════════════════════════
  let storeTenant = await tenantRepo.findOne({ where: { slug: 'tuchapato' } });
  if (!storeTenant) {
    storeTenant = await tenantRepo.save(
      tenantRepo.create({ name: 'Tu Chapato', slug: 'tuchapato' }),
    );
    console.log('Tenant created: Tu Chapato');
  } else {
    console.log('Tenant already exists: Tu Chapato');
  }
  const tenantId = storeTenant.id;

  // ── Store Admin ──
  let storeAdmin = await userRepo.findOne({ where: { email: 'tuchapato@gmail.com' } });
  if (!storeAdmin) {
    const passwordHash = await bcrypt.hash('tuchapato123', 10);
    storeAdmin = await userRepo.save(
      userRepo.create({
        email: 'tuchapato@gmail.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'Tu Chapato',
        role: Role.ADMIN,
        isActive: true,
        tenantId,
      }),
    );
    console.log('Store Admin created: tuchapato@gmail.com');
  } else {
    console.log('Store Admin already exists');
  }

  // ── Generic Client ──
  const existingGeneric = await clientRepo.findOne({
    where: { isGeneric: true, tenantId },
  });
  if (!existingGeneric) {
    await clientRepo.save(
      clientRepo.create({
        firstName: 'Consumidor',
        lastName: 'Final',
        documentType: DocumentType.CC,
        documentNumber: '0000000000',
        isGeneric: true,
        isActive: true,
        tenantId,
      }),
    );
    console.log('Generic client created: Consumidor Final');
  }

  // ── Warehouse ──
  let warehouse = await warehouseRepo.findOne({ where: { code: 'TCH-01', tenantId } });
  if (!warehouse) {
    warehouse = await warehouseRepo.save(
      warehouseRepo.create({
        name: 'Tu Chapato Principal',
        code: 'TCH-01',
        address: '',
        isPosLocation: true,
        tenantId,
      }),
    );
    console.log('Warehouse created: Tu Chapato Principal');
  }

  // ── Categories ──
  const categoriesData = [
    { name: 'Tenis', slug: 'tenis', sortOrder: 1 },
    { name: 'Botas', slug: 'botas', sortOrder: 2 },
    { name: 'Sandalias', slug: 'sandalias', sortOrder: 3 },
    { name: 'Zapatos Formales', slug: 'zapatos-formales', sortOrder: 4 },
    { name: 'Accesorios', slug: 'accesorios', sortOrder: 5 },
  ];

  const categories: Category[] = [];
  for (const cData of categoriesData) {
    let c = await categoryRepo.findOne({ where: { slug: cData.slug, tenantId } });
    if (!c) {
      c = await categoryRepo.save(categoryRepo.create({ ...cData, tenantId }));
      console.log(`Category created: ${c.name}`);
    }
    categories.push(c);
  }

  // ── Products ──
  const tenisCat = categories.find((c) => c.slug === 'tenis')!;
  const botasCat = categories.find((c) => c.slug === 'botas')!;
  const sandaliasCat = categories.find((c) => c.slug === 'sandalias')!;
  const formalesCat = categories.find((c) => c.slug === 'zapatos-formales')!;

  const productsData = [
    {
      name: 'Tenis Running Pro',
      skuPrefix: 'TNRPRO',
      basePrice: 159900,
      costPrice: 80000,
      gender: Gender.UNISEX,
      categoryId: tenisCat.id,
      taxRate: 19,
      isPublished: true,
      variants: [
        { size: '38', color: 'Blanco' },
        { size: '39', color: 'Blanco' },
        { size: '40', color: 'Blanco' },
        { size: '41', color: 'Blanco' },
        { size: '42', color: 'Blanco' },
        { size: '40', color: 'Negro' },
        { size: '41', color: 'Negro' },
        { size: '42', color: 'Negro' },
      ],
    },
    {
      name: 'Tenis Casual Urban',
      skuPrefix: 'TNCURB',
      basePrice: 129900,
      costPrice: 55000,
      gender: Gender.UNISEX,
      categoryId: tenisCat.id,
      taxRate: 19,
      isPublished: true,
      variants: [
        { size: '38', color: 'Negro' },
        { size: '39', color: 'Negro' },
        { size: '40', color: 'Negro' },
        { size: '41', color: 'Gris' },
        { size: '42', color: 'Gris' },
      ],
    },
    {
      name: 'Bota Chelsea Classic',
      skuPrefix: 'BTCHLS',
      basePrice: 219900,
      costPrice: 95000,
      gender: Gender.HOMBRE,
      categoryId: botasCat.id,
      taxRate: 19,
      isPublished: true,
      variants: [
        { size: '40', color: 'Café' },
        { size: '41', color: 'Café' },
        { size: '42', color: 'Café' },
        { size: '40', color: 'Negro' },
        { size: '41', color: 'Negro' },
      ],
    },
    {
      name: 'Sandalia Plataforma',
      skuPrefix: 'SNDPLT',
      basePrice: 89900,
      costPrice: 35000,
      gender: Gender.MUJER,
      categoryId: sandaliasCat.id,
      taxRate: 19,
      isPublished: true,
      variants: [
        { size: '35', color: 'Negro' },
        { size: '36', color: 'Negro' },
        { size: '37', color: 'Negro' },
        { size: '36', color: 'Beige' },
        { size: '37', color: 'Beige' },
      ],
    },
    {
      name: 'Zapato Oxford Ejecutivo',
      skuPrefix: 'ZPOXEJ',
      basePrice: 289900,
      costPrice: 120000,
      gender: Gender.HOMBRE,
      categoryId: formalesCat.id,
      taxRate: 19,
      isPublished: true,
      variants: [
        { size: '40', color: 'Negro' },
        { size: '41', color: 'Negro' },
        { size: '42', color: 'Negro' },
        { size: '41', color: 'Café' },
        { size: '42', color: 'Café' },
      ],
    },
  ];

  let barcodeCounter = 0;
  for (const pData of productsData) {
    let product = await productRepo.findOne({
      where: { skuPrefix: pData.skuPrefix, tenantId },
    });
    if (!product) {
      const { variants, isPublished, ...productFields } = pData;
      product = await productRepo.save(productRepo.create({
        ...productFields,
        slug: generateSlug(pData.name),
        isPublished,
        publishedAt: isPublished ? new Date() : undefined,
        tenantId,
      }));
      console.log(`Product created: ${product.name}`);

      const timestamp = Date.now().toString().slice(-6);
      for (const v of variants) {
        const sizeCode = v.size.toUpperCase().slice(0, 3);
        const colorCode = v.color
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .slice(0, 3);
        const sku = `${pData.skuPrefix}-${sizeCode}-${colorCode}`;
        const barcode = `78${timestamp}${String(barcodeCounter).padStart(4, '0')}`;
        barcodeCounter++;

        const variant = await variantRepo.save(
          variantRepo.create({
            productId: product.id,
            sku,
            size: v.size,
            color: v.color,
            barcode,
            tenantId,
          }),
        );

        const qty = Math.floor(Math.random() * 20) + 5;
        await stockRepo.save(
          stockRepo.create({
            variantId: variant.id,
            warehouseId: warehouse.id,
            quantity: qty,
            minStock: 3,
            tenantId,
          }),
        );

        await stockMovementRepo.save(
          stockMovementRepo.create({
            variantId: variant.id,
            warehouseId: warehouse.id,
            movementType: MovementType.IN,
            quantity: qty,
            referenceType: 'SEED',
            notes: 'Stock inicial',
            tenantId,
          }),
        );
      }
      console.log(`  -> ${variants.length} variants with stock created`);
    } else {
      console.log(`Product already exists: ${product.name}`);
    }
  }

  // ── Store Settings ──
  let storeSettings = await settingsRepo.findOne({ where: { tenantId } });
  if (!storeSettings) {
    storeSettings = await settingsRepo.save(
      settingsRepo.create({
        storeName: 'Tu Chapato',
        storeSlug: 'tuchapato',
        heroTitle: 'TU ESTILO.',
        heroSubtitle: 'DESDE LOS PIES.',
        accentColor: '#2563eb',
        whatsappNumber: '',
        aboutText: 'Tu Chapato: encuentra el calzado perfecto para cada ocasión.',
        isStorefrontActive: true,
        defaultWarehouseId: warehouse.id,
        tenantId,
      }),
    );
    console.log('Store settings created: Tu Chapato');
  } else {
    console.log('Store settings already exist');
  }

  await dataSource.destroy();
  console.log('\nSeed completed!');
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
