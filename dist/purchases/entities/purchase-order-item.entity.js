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
exports.PurchaseOrderItem = void 0;
const typeorm_1 = require("typeorm");
const purchase_order_entity_js_1 = require("./purchase-order.entity.js");
const product_variant_entity_js_1 = require("../../products/entities/product-variant.entity.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let PurchaseOrderItem = class PurchaseOrderItem extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    purchaseOrder;
    purchaseOrderId;
    variant;
    variantId;
    quantityOrdered;
    quantityReceived;
    unitCost;
};
exports.PurchaseOrderItem = PurchaseOrderItem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PurchaseOrderItem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => purchase_order_entity_js_1.PurchaseOrder, (po) => po.items, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'purchase_order_id' }),
    __metadata("design:type", purchase_order_entity_js_1.PurchaseOrder)
], PurchaseOrderItem.prototype, "purchaseOrder", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'purchase_order_id' }),
    __metadata("design:type", String)
], PurchaseOrderItem.prototype, "purchaseOrderId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => product_variant_entity_js_1.ProductVariant, { eager: true }),
    (0, typeorm_1.JoinColumn)({ name: 'variant_id' }),
    __metadata("design:type", product_variant_entity_js_1.ProductVariant)
], PurchaseOrderItem.prototype, "variant", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variant_id' }),
    __metadata("design:type", String)
], PurchaseOrderItem.prototype, "variantId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'quantity_ordered', type: 'int' }),
    __metadata("design:type", Number)
], PurchaseOrderItem.prototype, "quantityOrdered", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'quantity_received', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], PurchaseOrderItem.prototype, "quantityReceived", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", Number)
], PurchaseOrderItem.prototype, "unitCost", void 0);
exports.PurchaseOrderItem = PurchaseOrderItem = __decorate([
    (0, typeorm_1.Entity)('purchase_order_items')
], PurchaseOrderItem);
//# sourceMappingURL=purchase-order-item.entity.js.map