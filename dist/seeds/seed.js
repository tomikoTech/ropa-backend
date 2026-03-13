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
const store_settings_entity_js_1 = require("../storefront/entities/store-settings.entity.js");
const ecommerce_order_entity_js_1 = require("../storefront/entities/ecommerce-order.entity.js");
const ecommerce_order_item_entity_js_1 = require("../storefront/entities/ecommerce-order-item.entity.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
const gender_enum_js_1 = require("../common/enums/gender.enum.js");
const movement_type_enum_js_1 = require("../common/enums/movement-type.enum.js");
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
        store_settings_entity_js_1.StoreSettings,
        ecommerce_order_entity_js_1.EcommerceOrder,
        ecommerce_order_item_entity_js_1.EcommerceOrderItem,
    ],
    synchronize: true,
});
function generateSlug(name) {
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
    const tenantRepo = dataSource.getRepository(tenant_entity_js_1.Tenant);
    const userRepo = dataSource.getRepository(user_entity_js_1.User);
    const categoryRepo = dataSource.getRepository(category_entity_js_1.Category);
    const productRepo = dataSource.getRepository(product_entity_js_1.Product);
    const variantRepo = dataSource.getRepository(product_variant_entity_js_1.ProductVariant);
    const warehouseRepo = dataSource.getRepository(warehouse_entity_js_1.Warehouse);
    const stockRepo = dataSource.getRepository(stock_entity_js_1.Stock);
    const stockMovementRepo = dataSource.getRepository(stock_movement_entity_js_1.StockMovement);
    const clientRepo = dataSource.getRepository(client_entity_js_1.Client);
    const settingsRepo = dataSource.getRepository(store_settings_entity_js_1.StoreSettings);
    let platformTenant = await tenantRepo.findOne({
        where: { slug: 'mipinta-platform' },
    });
    if (!platformTenant) {
        platformTenant = await tenantRepo.save(tenantRepo.create({ name: 'MiPinta Platform', slug: 'mipinta-platform' }));
        console.log('Platform tenant created: MiPinta Platform');
    }
    else {
        console.log('Platform tenant already exists');
    }
    let superAdmin = await userRepo.findOne({
        where: { email: 'dyez1110@gmail.com' },
    });
    if (!superAdmin) {
        const passwordHash = await bcrypt.hash('supermario123', 10);
        superAdmin = await userRepo.save(userRepo.create({
            email: 'dyez1110@gmail.com',
            passwordHash,
            firstName: 'Dylan',
            lastName: 'Admin',
            role: role_enum_js_1.Role.SUPER_ADMIN,
            isActive: true,
            tenantId: platformTenant.id,
        }));
        console.log('Super Admin created: dyez1110@gmail.com');
    }
    else {
        console.log('Super Admin already exists');
    }
    let storeTenant = await tenantRepo.findOne({ where: { slug: 'tuchapato' } });
    if (!storeTenant) {
        storeTenant = await tenantRepo.save(tenantRepo.create({ name: 'Tu Chapato', slug: 'tuchapato' }));
        console.log('Tenant created: Tu Chapato');
    }
    else {
        console.log('Tenant already exists: Tu Chapato');
    }
    const tenantId = storeTenant.id;
    let storeAdmin = await userRepo.findOne({
        where: { email: 'tuchapato@gmail.com' },
    });
    if (!storeAdmin) {
        const passwordHash = await bcrypt.hash('tuchapato123', 10);
        storeAdmin = await userRepo.save(userRepo.create({
            email: 'tuchapato@gmail.com',
            passwordHash,
            firstName: 'Admin',
            lastName: 'Tu Chapato',
            role: role_enum_js_1.Role.ADMIN,
            isActive: true,
            tenantId,
        }));
        console.log('Store Admin created: tuchapato@gmail.com');
    }
    else {
        console.log('Store Admin already exists');
    }
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
    let warehouse = await warehouseRepo.findOne({
        where: { code: 'TCH-01', tenantId },
    });
    if (!warehouse) {
        warehouse = await warehouseRepo.save(warehouseRepo.create({
            name: 'Tu Chapato Principal',
            code: 'TCH-01',
            address: '',
            isPosLocation: true,
            tenantId,
        }));
        console.log('Warehouse created: Tu Chapato Principal');
    }
    const categoriesData = [
        { name: 'Tenis', slug: 'tenis', sortOrder: 1 },
        { name: 'Botas', slug: 'botas', sortOrder: 2 },
        { name: 'Sandalias', slug: 'sandalias', sortOrder: 3 },
        { name: 'Zapatos Formales', slug: 'zapatos-formales', sortOrder: 4 },
        { name: 'Accesorios', slug: 'accesorios', sortOrder: 5 },
    ];
    const categories = [];
    for (const cData of categoriesData) {
        let c = await categoryRepo.findOne({
            where: { slug: cData.slug, tenantId },
        });
        if (!c) {
            c = await categoryRepo.save(categoryRepo.create({ ...cData, tenantId }));
            console.log(`Category created: ${c.name}`);
        }
        categories.push(c);
    }
    const tenisCat = categories.find((c) => c.slug === 'tenis');
    const botasCat = categories.find((c) => c.slug === 'botas');
    const sandaliasCat = categories.find((c) => c.slug === 'sandalias');
    const formalesCat = categories.find((c) => c.slug === 'zapatos-formales');
    const productsData = [
        {
            name: 'Tenis Running Pro',
            skuPrefix: 'TNRPRO',
            basePrice: 159900,
            costPrice: 80000,
            gender: gender_enum_js_1.Gender.UNISEX,
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
            gender: gender_enum_js_1.Gender.UNISEX,
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
            gender: gender_enum_js_1.Gender.HOMBRE,
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
            gender: gender_enum_js_1.Gender.MUJER,
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
            gender: gender_enum_js_1.Gender.HOMBRE,
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
                const variant = await variantRepo.save(variantRepo.create({
                    productId: product.id,
                    sku,
                    size: v.size,
                    color: v.color,
                    barcode,
                    tenantId,
                }));
                const qty = Math.floor(Math.random() * 20) + 5;
                await stockRepo.save(stockRepo.create({
                    variantId: variant.id,
                    warehouseId: warehouse.id,
                    quantity: qty,
                    minStock: 3,
                    tenantId,
                }));
                await stockMovementRepo.save(stockMovementRepo.create({
                    variantId: variant.id,
                    warehouseId: warehouse.id,
                    movementType: movement_type_enum_js_1.MovementType.IN,
                    quantity: qty,
                    referenceType: 'SEED',
                    notes: 'Stock inicial',
                    tenantId,
                }));
            }
            console.log(`  -> ${variants.length} variants with stock created`);
        }
        else {
            console.log(`Product already exists: ${product.name}`);
        }
    }
    let storeSettings = await settingsRepo.findOne({ where: { tenantId } });
    if (!storeSettings) {
        storeSettings = await settingsRepo.save(settingsRepo.create({
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
        }));
        console.log('Store settings created: Tu Chapato');
    }
    else {
        console.log('Store settings already exist');
    }
    await dataSource.destroy();
    console.log('\nSeed completed!');
}
seed().catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map