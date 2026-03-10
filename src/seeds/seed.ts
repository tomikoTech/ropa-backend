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
import { Role } from '../common/enums/role.enum.js';
import { DiscountType } from '../common/enums/discount-type.enum.js';
import { Gender } from '../common/enums/gender.enum.js';
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
  ],
  synchronize: true,
});

async function seed() {
  await dataSource.initialize();
  console.log('Database connected');

  // ─── Default Tenant ───
  const tenantRepo = dataSource.getRepository(Tenant);
  let tenant = await tenantRepo.findOne({ where: { slug: 'tomiko-default' } });
  if (!tenant) {
    tenant = await tenantRepo.save(
      tenantRepo.create({ name: 'Tomiko Default', slug: 'tomiko-default' }),
    );
    console.log('Default tenant created: Tomiko Default');
  } else {
    console.log('Default tenant already exists');
  }
  const tenantId = tenant.id;

  const userRepo = dataSource.getRepository(User);
  const categoryRepo = dataSource.getRepository(Category);
  const productRepo = dataSource.getRepository(Product);
  const variantRepo = dataSource.getRepository(ProductVariant);
  const warehouseRepo = dataSource.getRepository(Warehouse);
  const stockRepo = dataSource.getRepository(Stock);

  // ─── Users ───
  let adminUser: User;
  const existingAdmin = await userRepo.findOne({
    where: { email: 'admin@tomiko.co' },
  });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    adminUser = await userRepo.save(
      userRepo.create({
        email: 'admin@tomiko.co',
        passwordHash,
        firstName: 'Admin',
        lastName: 'Tomiko',
        role: Role.ADMIN,
        isActive: true,
        tenantId,
      }),
    );
    console.log('Admin user created: admin@tomiko.co / admin123');
  } else {
    adminUser = existingAdmin;
    console.log('Admin user already exists');
  }

  const existingVendedor = await userRepo.findOne({
    where: { email: 'vendedor@tomiko.co' },
  });
  if (!existingVendedor) {
    const passwordHash = await bcrypt.hash('vendedor123', 10);
    await userRepo.save(
      userRepo.create({
        email: 'vendedor@tomiko.co',
        passwordHash,
        firstName: 'Vendedor',
        lastName: 'Demo',
        role: Role.VENTAS,
        isActive: true,
        tenantId,
      }),
    );
    console.log('Vendedor user created: vendedor@tomiko.co / vendedor123');
  } else {
    console.log('Vendedor user already exists');
  }

  // ─── Clients ───
  const clientRepo = dataSource.getRepository(Client);
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
  } else {
    console.log('Generic client already exists');
  }

  // Sample clients
  const sampleClients = [
    {
      firstName: 'María',
      lastName: 'González',
      documentType: DocumentType.CC,
      documentNumber: '1098765432',
      email: 'maria@email.com',
      phone: '3001234567',
    },
    {
      firstName: 'Carlos',
      lastName: 'Rodríguez',
      documentType: DocumentType.CC,
      documentNumber: '1087654321',
      email: 'carlos@email.com',
      phone: '3109876543',
    },
    {
      firstName: 'Almacenes ABC',
      lastName: 'S.A.S',
      documentType: DocumentType.NIT,
      documentNumber: '900123456-7',
      email: 'ventas@abc.com',
      phone: '6012345678',
      address: 'Calle 100 #15-20, Bogotá',
    },
  ];

  for (const cData of sampleClients) {
    const existing = await clientRepo.findOne({
      where: { documentNumber: cData.documentNumber, tenantId },
    });
    if (!existing) {
      await clientRepo.save(clientRepo.create({ ...cData, tenantId }));
      console.log(`Client created: ${cData.firstName} ${cData.lastName}`);
    }
  }

  // ─── Warehouses ───
  const warehousesData = [
    { name: 'Bodega Principal', code: 'BOD-01', address: 'Bodega central', isPosLocation: false },
    { name: 'Tienda Centro', code: 'TDA-01', address: 'Local centro comercial', isPosLocation: true },
    { name: 'Tienda Norte', code: 'TDA-02', address: 'Local zona norte', isPosLocation: true },
  ];

  const warehouses: Warehouse[] = [];
  for (const wData of warehousesData) {
    let w = await warehouseRepo.findOne({ where: { code: wData.code, tenantId } });
    if (!w) {
      w = await warehouseRepo.save(warehouseRepo.create({ ...wData, tenantId }));
      console.log(`Warehouse created: ${w.name}`);
    }
    warehouses.push(w);
  }

  // ─── Categories ───
  const categoriesData = [
    { name: 'Camisetas', slug: 'camisetas', sortOrder: 1 },
    { name: 'Pantalones', slug: 'pantalones', sortOrder: 2 },
    { name: 'Zapatos', slug: 'zapatos', sortOrder: 3 },
    { name: 'Accesorios', slug: 'accesorios', sortOrder: 4 },
    { name: 'Vestidos', slug: 'vestidos', sortOrder: 5 },
    { name: 'Chaquetas', slug: 'chaquetas', sortOrder: 6 },
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

  // Subcategories
  const subCategoriesData = [
    { name: 'Camisetas Polo', slug: 'camisetas-polo', parentSlug: 'camisetas', sortOrder: 1 },
    { name: 'Camisetas Básicas', slug: 'camisetas-basicas', parentSlug: 'camisetas', sortOrder: 2 },
    { name: 'Jeans', slug: 'jeans', parentSlug: 'pantalones', sortOrder: 1 },
    { name: 'Pantalones Formales', slug: 'pantalones-formales', parentSlug: 'pantalones', sortOrder: 2 },
    { name: 'Tenis', slug: 'tenis', parentSlug: 'zapatos', sortOrder: 1 },
    { name: 'Botas', slug: 'botas', parentSlug: 'zapatos', sortOrder: 2 },
    { name: 'Sandalias', slug: 'sandalias', parentSlug: 'zapatos', sortOrder: 3 },
  ];

  for (const scData of subCategoriesData) {
    let sc = await categoryRepo.findOne({ where: { slug: scData.slug, tenantId } });
    if (!sc) {
      const parent = categories.find(
        (c) => c.slug === scData.parentSlug,
      );
      sc = await categoryRepo.save(
        categoryRepo.create({
          name: scData.name,
          slug: scData.slug,
          sortOrder: scData.sortOrder,
          parentId: parent?.id,
          tenantId,
        }),
      );
      console.log(`Subcategory created: ${sc.name}`);
    }
  }

  // ─── Sample Products ───
  const camisetasCat = categories.find((c) => c.slug === 'camisetas')!;
  const jeansCat = await categoryRepo.findOne({ where: { slug: 'jeans', tenantId } });
  const tenisCat = await categoryRepo.findOne({ where: { slug: 'tenis', tenantId } });

  const productsData = [
    {
      name: 'Camiseta Polo Classic',
      skuPrefix: 'POLCLS',
      basePrice: 49900,
      costPrice: 25000,
      gender: Gender.HOMBRE,
      categoryId: camisetasCat.id,
      taxRate: 19,
      variants: [
        { size: 'S', color: 'Negro' },
        { size: 'M', color: 'Negro' },
        { size: 'L', color: 'Negro' },
        { size: 'S', color: 'Blanco' },
        { size: 'M', color: 'Blanco' },
        { size: 'L', color: 'Blanco' },
        { size: 'M', color: 'Azul' },
        { size: 'L', color: 'Azul' },
      ],
    },
    {
      name: 'Camiseta Básica Mujer',
      skuPrefix: 'BSCMUJ',
      basePrice: 29900,
      costPrice: 12000,
      gender: Gender.MUJER,
      categoryId: camisetasCat.id,
      taxRate: 19,
      variants: [
        { size: 'XS', color: 'Rosa' },
        { size: 'S', color: 'Rosa' },
        { size: 'M', color: 'Rosa' },
        { size: 'S', color: 'Negro' },
        { size: 'M', color: 'Negro' },
      ],
    },
    {
      name: 'Jean Slim Fit',
      skuPrefix: 'JNSLIM',
      basePrice: 89900,
      costPrice: 45000,
      gender: Gender.HOMBRE,
      categoryId: jeansCat?.id,
      taxRate: 19,
      variants: [
        { size: '28', color: 'Azul Oscuro' },
        { size: '30', color: 'Azul Oscuro' },
        { size: '32', color: 'Azul Oscuro' },
        { size: '34', color: 'Azul Oscuro' },
        { size: '30', color: 'Negro' },
        { size: '32', color: 'Negro' },
      ],
    },
    {
      name: 'Tenis Running Pro',
      skuPrefix: 'TNRPRO',
      basePrice: 159900,
      costPrice: 80000,
      gender: Gender.UNISEX,
      categoryId: tenisCat?.id,
      taxRate: 19,
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
  ];

  for (const pData of productsData) {
    let product = await productRepo.findOne({
      where: { skuPrefix: pData.skuPrefix, tenantId },
    });
    if (!product) {
      const { variants, ...productFields } = pData;
      product = await productRepo.save(productRepo.create({ ...productFields, tenantId }));
      console.log(`Product created: ${product.name}`);

      const timestamp = Date.now().toString().slice(-6);
      let variantIndex = 0;
      for (const v of variants) {
        const sizeCode = v.size.toUpperCase().slice(0, 3);
        const colorCode = v.color
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .slice(0, 3);
        const sku = `${pData.skuPrefix}-${sizeCode}-${colorCode}`;
        const barcode = `78${timestamp}${String(variantIndex).padStart(4, '0')}`;

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

        // Add stock to warehouses
        for (const w of warehouses) {
          const qty = Math.floor(Math.random() * 20) + 5;
          await stockRepo.save(
            stockRepo.create({
              variantId: variant.id,
              warehouseId: w.id,
              quantity: qty,
              minStock: 3,
              tenantId,
            }),
          );
        }
        variantIndex++;
      }
      console.log(`  -> ${variants.length} variants with stock created`);
    } else {
      console.log(`Product already exists: ${product.name}`);
    }
  }

  // ─── Suppliers ───
  const supplierRepo = dataSource.getRepository(Supplier);
  const sampleSuppliers = [
    {
      name: 'Textiles Colombia S.A.S',
      nit: '900456789-1',
      contactName: 'Juan Pérez',
      email: 'ventas@textilescol.co',
      phone: '6044567890',
      address: 'Calle 50 #30-20, Medellín',
    },
    {
      name: 'Calzado Nacional Ltda',
      nit: '800123456-2',
      contactName: 'Ana Martínez',
      email: 'pedidos@calzadonacional.co',
      phone: '6012345678',
      address: 'Carrera 10 #15-30, Bogotá',
    },
    {
      name: 'Distribuidora Fashion',
      nit: '901234567-3',
      contactName: 'Pedro López',
      email: 'pedro@distrifashion.co',
      phone: '3159876543',
      address: 'Av. 6N #25-10, Cali',
    },
  ];

  for (const sData of sampleSuppliers) {
    const existing = await supplierRepo.findOne({
      where: { nit: sData.nit, tenantId },
    });
    if (!existing) {
      await supplierRepo.save(supplierRepo.create({ ...sData, tenantId }));
      console.log(`Supplier created: ${sData.name}`);
    }
  }

  // ─── Promotions ───
  const promoRepo = dataSource.getRepository(Promotion);
  const samplePromos = [
    {
      name: 'Descuento de Temporada 15%',
      description: 'Descuento general de temporada en todos los productos',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 15,
      applicableTo: 'ALL',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-31'),
      maxUses: 500,
    },
    {
      name: 'Promo Camisetas $10,000 OFF',
      description: 'Descuento fijo en camisetas',
      discountType: DiscountType.FIXED,
      discountValue: 10000,
      applicableTo: 'CATEGORY',
      applicableId: camisetasCat.id,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-04-30'),
    },
  ];

  for (const pData of samplePromos) {
    const existing = await promoRepo.findOne({
      where: { name: pData.name, tenantId },
    });
    if (!existing) {
      await promoRepo.save(promoRepo.create({ ...pData, tenantId }));
      console.log(`Promotion created: ${pData.name}`);
    }
  }

  // ─── Backfill existing data with tenant_id ───
  const tables = [
    'users', 'categories', 'products', 'product_variants', 'warehouses',
    'stock', 'stock_movements', 'clients', 'sales', 'sale_items',
    'payments', 'accounts_receivable', 'accounts_receivable_payments',
    'suppliers', 'purchase_orders', 'purchase_order_items',
    'accounts_payable', 'promotions', 'returns', 'return_items',
    'credit_notes', 'audit_logs',
  ];

  for (const table of tables) {
    const result = await dataSource.query(
      `UPDATE "${table}" SET tenant_id = $1 WHERE tenant_id IS NULL`,
      [tenantId],
    );
    if (result[1] > 0) {
      console.log(`Backfilled ${result[1]} rows in ${table}`);
    }
  }

  await dataSource.destroy();
  console.log('\nSeed completed!');
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
