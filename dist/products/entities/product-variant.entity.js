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
exports.ProductVariant = void 0;
const typeorm_1 = require("typeorm");
const product_entity_js_1 = require("./product.entity.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let ProductVariant = class ProductVariant extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    product;
    productId;
    sku;
    size;
    color;
    barcode;
    priceOverride;
    isActive;
    createdAt;
    updatedAt;
};
exports.ProductVariant = ProductVariant;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ProductVariant.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => product_entity_js_1.Product, (p) => p.variants, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'product_id' }),
    __metadata("design:type", product_entity_js_1.Product)
], ProductVariant.prototype, "product", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'product_id' }),
    __metadata("design:type", String)
], ProductVariant.prototype, "productId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ProductVariant.prototype, "sku", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, default: '' }),
    __metadata("design:type", String)
], ProductVariant.prototype, "size", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, default: '' }),
    __metadata("design:type", String)
], ProductVariant.prototype, "color", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ProductVariant.prototype, "barcode", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'price_override',
        type: 'decimal',
        precision: 12,
        scale: 2,
        nullable: true,
    }),
    __metadata("design:type", Object)
], ProductVariant.prototype, "priceOverride", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', default: true }),
    __metadata("design:type", Boolean)
], ProductVariant.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], ProductVariant.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], ProductVariant.prototype, "updatedAt", void 0);
exports.ProductVariant = ProductVariant = __decorate([
    (0, typeorm_1.Entity)('product_variants'),
    (0, typeorm_1.Unique)(['tenantId', 'sku']),
    (0, typeorm_1.Unique)(['tenantId', 'barcode'])
], ProductVariant);
//# sourceMappingURL=product-variant.entity.js.map