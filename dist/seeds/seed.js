"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const bcrypt = __importStar(require("bcrypt"));
const user_entity_js_1 = require("../users/entities/user.entity.js");
const refresh_token_entity_js_1 = require("../auth/entities/refresh-token.entity.js");
const category_entity_js_1 = require("../categories/entities/category.entity.js");
const product_entity_js_1 = require("../products/entities/product.entity.js");
const product_variant_entity_js_1 = require("../products/entities/product-variant.entity.js");
const warehouse_entity_js_1 = require("../inventory/entities/warehouse.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const stock_movement_entity_js_1 = require("../inventory/entities/stock-movement.entity.js");
const client_entity_js_1 = require("../clients/entities/client.entity.js");
const sale_entity_js_1 = require("../pos/entities/sale.entity.js");
const sale_item_entity_js_1 = require("../pos/entities/sale-item.entity.js");
const payment_entity_js_1 = require("../pos/entities/payment.entity.js");
const accounts_receivable_entity_js_1 = require("../pos/entities/accounts-receivable.entity.js");
const accounts_receivable_payment_entity_js_1 = require("../pos/entities/accounts-receivable-payment.entity.js");
const supplier_entity_js_1 = require("../suppliers/entities/supplier.entity.js");
const purchase_order_entity_js_1 = require("../purchases/entities/purchase-order.entity.js");
const purchase_order_item_entity_js_1 = require("../purchases/entities/purchase-order-item.entity.js");
const accounts_payable_entity_js_1 = require("../purchases/entities/accounts-payable.entity.js");
const promotion_entity_js_1 = require("../promotions/entities/promotion.entity.js");
const return_entity_js_1 = require("../returns/entities/return.entity.js");
const return_item_entity_js_1 = require("../returns/entities/return-item.entity.js");
const credit_note_entity_js_1 = require("../returns/entities/credit-note.entity.js");
const audit_log_entity_js_1 = require("../audit/entities/audit-log.entity.js");
const tenant_entity_js_1 = require("../tenants/entities/tenant.entity.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
const discount_type_enum_js_1 = require("../common/enums/discount-type.enum.js");
const gender_enum_js_1 = require("../common/enums/gender.enum.js");
const document_type_enum_js_1 = require("../common/enums/document-type.enum.js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const dataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME || 'dylanbc1',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'ropa_pos',
    entities: [
        tenant_entity_js_1.Tenant,
        user_entity_js_1.User,
        refresh_token_entity_js_1.RefreshToken,
        category_entity_js_1.Category,
        product_entity_js_1.Product,
        product_variant_entity_js_1.ProductVariant,
        warehouse_entity_js_1.Warehouse,
        stock_entity_js_1.Stock,
        stock_movement_entity_js_1.StockMovement,
        client_entity_js_1.Client,
        sale_entity_js_1.Sale,
        sale_item_entity_js_1.SaleItem,
        payment_entity_js_1.Payment,
        accounts_receivable_entity_js_1.AccountsReceivable,
        accounts_receivable_payment_entity_js_1.AccountsReceivablePayment,
        supplier_entity_js_1.Supplier,
        purchase_order_entity_js_1.PurchaseOrder,
        purchase_order_item_entity_js_1.PurchaseOrderItem,
        accounts_payable_entity_js_1.AccountsPayable,
        promotion_entity_js_1.Promotion,
        return_entity_js_1.Return,
        return_item_entity_js_1.ReturnItem,
        credit_note_entity_js_1.CreditNote,
        audit_log_entity_js_1.AuditLog,
    ],
    synchronize: true,
});
async function seed() {
    await dataSource.initialize();
    console.log('Database connected');
    const tenantRepo = dataSource.getRepository(tenant_entity_js_1.Tenant);
    let tenant = await tenantRepo.findOne({ where: { slug: 'tomiko-default' } });
    if (!tenant) {
        tenant = await tenantRepo.save(tenantRepo.create({ name: 'Tomiko Default', slug: 'tomiko-default' }));
        console.log('Default tenant created: Tomiko Default');
    }
    else {
        console.log('Default tenant already exists');
    }
    const tenantId = tenant.id;
    const userRepo = dataSource.getRepository(user_entity_js_1.User);
    const categoryRepo = dataSource.getRepository(category_entity_js_1.Category);
    const productRepo = dataSource.getRepository(product_entity_js_1.Product);
    const variantRepo = dataSource.getRepository(product_variant_entity_js_1.ProductVariant);
    const warehouseRepo = dataSource.getRepository(warehouse_entity_js_1.Warehouse);
    const stockRepo = dataSource.getRepository(stock_entity_js_1.Stock);
    let adminUser;
    const existingAdmin = await userRepo.findOne({
        where: { email: 'admin@tomiko.co' },
    });
    if (!existingAdmin) {
        const passwordHash = await bcrypt.hash('admin123', 10);
        adminUser = await userRepo.save(userRepo.create({
            email: 'admin@tomiko.co',
            passwordHash,
            firstName: 'Admin',
            lastName: 'Tomiko',
            role: role_enum_js_1.Role.ADMIN,
            isActive: true,
            tenantId,
        }));
        console.log('Admin user created: admin@tomiko.co / admin123');
    }
    else {
        adminUser = existingAdmin;
        console.log('Admin user already exists');
    }
    const existingVendedor = await userRepo.findOne({
        where: { email: 'vendedor@tomiko.co' },
    });
    if (!existingVendedor) {
        const passwordHash = await bcrypt.hash('vendedor123', 10);
        await userRepo.save(userRepo.create({
            email: 'vendedor@tomiko.co',
            passwordHash,
            firstName: 'Vendedor',
            lastName: 'Demo',
            role: role_enum_js_1.Role.VENTAS,
            isActive: true,
            tenantId,
        }));
        console.log('Vendedor user created: vendedor@tomiko.co / vendedor123');
    }
    else {
        console.log('Vendedor user already exists');
    }
    const clientRepo = dataSource.getRepository(client_entity_js_1.Client);
    const existingGeneric = await clientRepo.findOne({
        where: { isGeneric: true, tenantId },
    });
    if (!existingGeneric) {
        await clientRepo.save(clientRepo.create({
            firstName: 'Consumidor',
            lastName: 'Final',
            documentType: document_type_enum_js_1.DocumentType.CC,
            documentNumber: '0000000000',
            isGeneric: true,
            isActive: true,
            tenantId,
        }));
        console.log('Generic client created: Consumidor Final');
    }
    else {
        console.log('Generic client already exists');
    }
    const sampleClients = [
        {
            firstName: 'María',
            lastName: 'González',
            documentType: document_type_enum_js_1.DocumentType.CC,
            documentNumber: '1098765432',
            email: 'maria@email.com',
            phone: '3001234567',
        },
        {
            firstName: 'Carlos',
            lastName: 'Rodríguez',
            documentType: document_type_enum_js_1.DocumentType.CC,
            documentNumber: '1087654321',
            email: 'carlos@email.com',
            phone: '3109876543',
        },
        {
            firstName: 'Almacenes ABC',
            lastName: 'S.A.S',
            documentType: document_type_enum_js_1.DocumentType.NIT,
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
    const warehousesData = [
        { name: 'Bodega Principal', code: 'BOD-01', address: 'Bodega central', isPosLocation: false },
        { name: 'Tienda Centro', code: 'TDA-01', address: 'Local centro comercial', isPosLocation: true },
        { name: 'Tienda Norte', code: 'TDA-02', address: 'Local zona norte', isPosLocation: true },
    ];
    const warehouses = [];
    for (const wData of warehousesData) {
        let w = await warehouseRepo.findOne({ where: { code: wData.code, tenantId } });
        if (!w) {
            w = await warehouseRepo.save(warehouseRepo.create({ ...wData, tenantId }));
            console.log(`Warehouse created: ${w.name}`);
        }
        warehouses.push(w);
    }
    const categoriesData = [
        { name: 'Camisetas', slug: 'camisetas', sortOrder: 1 },
        { name: 'Pantalones', slug: 'pantalones', sortOrder: 2 },
        { name: 'Zapatos', slug: 'zapatos', sortOrder: 3 },
        { name: 'Accesorios', slug: 'accesorios', sortOrder: 4 },
        { name: 'Vestidos', slug: 'vestidos', sortOrder: 5 },
        { name: 'Chaquetas', slug: 'chaquetas', sortOrder: 6 },
    ];
    const categories = [];
    for (const cData of categoriesData) {
        let c = await categoryRepo.findOne({ where: { slug: cData.slug, tenantId } });
        if (!c) {
            c = await categoryRepo.save(categoryRepo.create({ ...cData, tenantId }));
            console.log(`Category created: ${c.name}`);
        }
        categories.push(c);
    }
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
            const parent = categories.find((c) => c.slug === scData.parentSlug);
            sc = await categoryRepo.save(categoryRepo.create({
                name: scData.name,
                slug: scData.slug,
                sortOrder: scData.sortOrder,
                parentId: parent?.id,
                tenantId,
            }));
            console.log(`Subcategory created: ${sc.name}`);
        }
    }
    const camisetasCat = categories.find((c) => c.slug === 'camisetas');
    const jeansCat = await categoryRepo.findOne({ where: { slug: 'jeans', tenantId } });
    const tenisCat = await categoryRepo.findOne({ where: { slug: 'tenis', tenantId } });
    const productsData = [
        {
            name: 'Camiseta Polo Classic',
            skuPrefix: 'POLCLS',
            basePrice: 49900,
            costPrice: 25000,
            gender: gender_enum_js_1.Gender.HOMBRE,
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
            gender: gender_enum_js_1.Gender.MUJER,
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
            gender: gender_enum_js_1.Gender.HOMBRE,
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
            gender: gender_enum_js_1.Gender.UNISEX,
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
                const variant = await variantRepo.save(variantRepo.create({
                    productId: product.id,
                    sku,
                    size: v.size,
                    color: v.color,
                    barcode,
                    tenantId,
                }));
                for (const w of warehouses) {
                    const qty = Math.floor(Math.random() * 20) + 5;
                    await stockRepo.save(stockRepo.create({
                        variantId: variant.id,
                        warehouseId: w.id,
                        quantity: qty,
                        minStock: 3,
                        tenantId,
                    }));
                }
                variantIndex++;
            }
            console.log(`  -> ${variants.length} variants with stock created`);
        }
        else {
            console.log(`Product already exists: ${product.name}`);
        }
    }
    const supplierRepo = dataSource.getRepository(supplier_entity_js_1.Supplier);
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
    const promoRepo = dataSource.getRepository(promotion_entity_js_1.Promotion);
    const samplePromos = [
        {
            name: 'Descuento de Temporada 15%',
            description: 'Descuento general de temporada en todos los productos',
            discountType: discount_type_enum_js_1.DiscountType.PERCENTAGE,
            discountValue: 15,
            applicableTo: 'ALL',
            startDate: new Date('2026-03-01'),
            endDate: new Date('2026-03-31'),
            maxUses: 500,
        },
        {
            name: 'Promo Camisetas $10,000 OFF',
            description: 'Descuento fijo en camisetas',
            discountType: discount_type_enum_js_1.DiscountType.FIXED,
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
    const tables = [
        'users', 'categories', 'products', 'product_variants', 'warehouses',
        'stock', 'stock_movements', 'clients', 'sales', 'sale_items',
        'payments', 'accounts_receivable', 'accounts_receivable_payments',
        'suppliers', 'purchase_orders', 'purchase_order_items',
        'accounts_payable', 'promotions', 'returns', 'return_items',
        'credit_notes', 'audit_logs',
    ];
    for (const table of tables) {
        const result = await dataSource.query(`UPDATE "${table}" SET tenant_id = $1 WHERE tenant_id IS NULL`, [tenantId]);
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
//# sourceMappingURL=seed.js.map