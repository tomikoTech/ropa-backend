"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaleItem = void 0;
const typeorm_1 = require("typeorm");
const sale_entity_js_1 = require("./sale.entity.js");
const product_variant_entity_js_1 = require("../../products/entities/product-variant.entity.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let SaleItem = class SaleItem extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    sale;
    saleId;
    variant;
    variantId;
    productName;
    variantSku;
    variantSize;
    variantColor;
    quantity;
    unitPrice;
    discountPercent;
    taxRate;
    taxAmount;
    lineTotal;
    createdAt;
};
exports.SaleItem = SaleItem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SaleItem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => sale_entity_js_1.Sale, (sale) => sale.items, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'sale_id' }),
    __metadata("design:type", sale_entity_js_1.Sale)
], SaleItem.prototype, "sale", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sale_id' }),
    __metadata("design:type", String)
], SaleItem.prototype, "saleId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => product_variant_entity_js_1.ProductVariant),
    (0, typeorm_1.JoinColumn)({ name: 'variant_id' }),
    __metadata("design:type", product_variant_entity_js_1.ProductVariant)
], SaleItem.prototype, "variant", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variant_id' }),
    __metadata("design:type", String)
], SaleItem.prototype, "variantId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'product_name' }),
    __metadata("design:type", String)
], SaleItem.prototype, "productName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variant_sku' }),
    __metadata("design:type", String)
], SaleItem.prototype, "variantSku", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variant_size' }),
    __metadata("design:type", String)
], SaleItem.prototype, "variantSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variant_color' }),
    __metadata("design:type", String)
], SaleItem.prototype, "variantColor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], SaleItem.prototype, "quantity", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'unit_price',
        type: 'decimal',
        precision: 12,
        scale: 2,
    }),
    __metadata("design:type", Number)
], SaleItem.prototype, "unitPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'discount_percent',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], SaleItem.prototype, "discountPercent", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'tax_rate',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: 19,
    }),
    __metadata("design:type", Number)
], SaleItem.prototype, "taxRate", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'tax_amount',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], SaleItem.prototype, "taxAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'line_total',
        type: 'decimal',
        precision: 14,
        scale: 2,
    }),
    __metadata("design:type", Number)
], SaleItem.prototype, "lineTotal", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], SaleItem.prototype, "createdAt", void 0);
exports.SaleItem = SaleItem = __decorate([
    (0, typeorm_1.Entity)('sale_items')
], SaleItem);
//# sourceMappingURL=sale-item.entity.js.map