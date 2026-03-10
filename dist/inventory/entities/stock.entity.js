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
exports.Stock = void 0;
const typeorm_1 = require("typeorm");
const product_variant_entity_js_1 = require("../../products/entities/product-variant.entity.js");
const warehouse_entity_js_1 = require("./warehouse.entity.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let Stock = class Stock extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    variant;
    variantId;
    warehouse;
    warehouseId;
    quantity;
    minStock;
    updatedAt;
};
exports.Stock = Stock;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Stock.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => product_variant_entity_js_1.ProductVariant, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'variant_id' }),
    __metadata("design:type", product_variant_entity_js_1.ProductVariant)
], Stock.prototype, "variant", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variant_id' }),
    __metadata("design:type", String)
], Stock.prototype, "variantId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => warehouse_entity_js_1.Warehouse, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'warehouse_id' }),
    __metadata("design:type", warehouse_entity_js_1.Warehouse)
], Stock.prototype, "warehouse", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'warehouse_id' }),
    __metadata("design:type", String)
], Stock.prototype, "warehouseId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], Stock.prototype, "quantity", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'min_stock', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], Stock.prototype, "minStock", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Stock.prototype, "updatedAt", void 0);
exports.Stock = Stock = __decorate([
    (0, typeorm_1.Entity)('stock'),
    (0, typeorm_1.Unique)(['tenantId', 'variantId', 'warehouseId'])
], Stock);
//# sourceMappingURL=stock.entity.js.map