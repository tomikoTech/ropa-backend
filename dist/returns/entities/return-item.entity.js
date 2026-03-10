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
exports.ReturnItem = void 0;
const typeorm_1 = require("typeorm");
const return_entity_js_1 = require("./return.entity.js");
const sale_item_entity_js_1 = require("../../pos/entities/sale-item.entity.js");
const product_variant_entity_js_1 = require("../../products/entities/product-variant.entity.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let ReturnItem = class ReturnItem extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    return;
    returnId;
    saleItem;
    saleItemId;
    variant;
    variantId;
    quantity;
    unitPrice;
};
exports.ReturnItem = ReturnItem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ReturnItem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => return_entity_js_1.Return, (r) => r.items, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'return_id' }),
    __metadata("design:type", return_entity_js_1.Return)
], ReturnItem.prototype, "return", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'return_id' }),
    __metadata("design:type", String)
], ReturnItem.prototype, "returnId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => sale_item_entity_js_1.SaleItem),
    (0, typeorm_1.JoinColumn)({ name: 'sale_item_id' }),
    __metadata("design:type", sale_item_entity_js_1.SaleItem)
], ReturnItem.prototype, "saleItem", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sale_item_id' }),
    __metadata("design:type", String)
], ReturnItem.prototype, "saleItemId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => product_variant_entity_js_1.ProductVariant),
    (0, typeorm_1.JoinColumn)({ name: 'variant_id' }),
    __metadata("design:type", product_variant_entity_js_1.ProductVariant)
], ReturnItem.prototype, "variant", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variant_id' }),
    __metadata("design:type", String)
], ReturnItem.prototype, "variantId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], ReturnItem.prototype, "quantity", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'unit_price', type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", Number)
], ReturnItem.prototype, "unitPrice", void 0);
exports.ReturnItem = ReturnItem = __decorate([
    (0, typeorm_1.Entity)('return_items')
], ReturnItem);
//# sourceMappingURL=return-item.entity.js.map