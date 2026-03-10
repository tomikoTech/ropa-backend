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
exports.Product = void 0;
const typeorm_1 = require("typeorm");
const category_entity_js_1 = require("../../categories/entities/category.entity.js");
const product_variant_entity_js_1 = require("./product-variant.entity.js");
const gender_enum_js_1 = require("../../common/enums/gender.enum.js");
const product_status_enum_js_1 = require("../../common/enums/product-status.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let Product = class Product extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    name;
    skuPrefix;
    description;
    basePrice;
    costPrice;
    gender;
    category;
    categoryId;
    status;
    taxRate;
    imageUrl;
    variants;
    createdAt;
    updatedAt;
};
exports.Product = Product;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Product.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Product.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sku_prefix' }),
    __metadata("design:type", String)
], Product.prototype, "skuPrefix", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Product.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'base_price', type: 'decimal', precision: 12, scale: 2 }),
    __metadata("design:type", Number)
], Product.prototype, "basePrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cost_price', type: 'decimal', precision: 12, scale: 2 }),
    __metadata("design:type", Number)
], Product.prototype, "costPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: gender_enum_js_1.Gender, default: gender_enum_js_1.Gender.UNISEX }),
    __metadata("design:type", String)
], Product.prototype, "gender", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => category_entity_js_1.Category, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'category_id' }),
    __metadata("design:type", category_entity_js_1.Category)
], Product.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'category_id', nullable: true }),
    __metadata("design:type", String)
], Product.prototype, "categoryId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: product_status_enum_js_1.ProductStatus,
        default: product_status_enum_js_1.ProductStatus.ACTIVE,
    }),
    __metadata("design:type", String)
], Product.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'tax_rate',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: 19,
    }),
    __metadata("design:type", Number)
], Product.prototype, "taxRate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'image_url', nullable: true }),
    __metadata("design:type", String)
], Product.prototype, "imageUrl", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => product_variant_entity_js_1.ProductVariant, (v) => v.product, {
        cascade: true,
        eager: false,
    }),
    __metadata("design:type", Array)
], Product.prototype, "variants", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Product.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Product.prototype, "updatedAt", void 0);
exports.Product = Product = __decorate([
    (0, typeorm_1.Entity)('products'),
    (0, typeorm_1.Unique)(['tenantId', 'skuPrefix'])
], Product);
//# sourceMappingURL=product.entity.js.map