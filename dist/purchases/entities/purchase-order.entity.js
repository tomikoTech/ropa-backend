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
exports.PurchaseOrder = void 0;
const typeorm_1 = require("typeorm");
const supplier_entity_js_1 = require("../../suppliers/entities/supplier.entity.js");
const warehouse_entity_js_1 = require("../../inventory/entities/warehouse.entity.js");
const user_entity_js_1 = require("../../users/entities/user.entity.js");
const purchase_order_item_entity_js_1 = require("./purchase-order-item.entity.js");
const accounts_payable_entity_js_1 = require("./accounts-payable.entity.js");
const purchase_order_status_enum_js_1 = require("../../common/enums/purchase-order-status.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let PurchaseOrder = class PurchaseOrder extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    orderNumber;
    supplier;
    supplierId;
    warehouse;
    warehouseId;
    createdBy;
    createdById;
    status;
    total;
    notes;
    items;
    accountsPayable;
    createdAt;
    updatedAt;
};
exports.PurchaseOrder = PurchaseOrder;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PurchaseOrder.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'order_number' }),
    __metadata("design:type", String)
], PurchaseOrder.prototype, "orderNumber", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => supplier_entity_js_1.Supplier, { eager: true }),
    (0, typeorm_1.JoinColumn)({ name: 'supplier_id' }),
    __metadata("design:type", supplier_entity_js_1.Supplier)
], PurchaseOrder.prototype, "supplier", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'supplier_id' }),
    __metadata("design:type", String)
], PurchaseOrder.prototype, "supplierId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => warehouse_entity_js_1.Warehouse, { eager: true }),
    (0, typeorm_1.JoinColumn)({ name: 'warehouse_id' }),
    __metadata("design:type", warehouse_entity_js_1.Warehouse)
], PurchaseOrder.prototype, "warehouse", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'warehouse_id' }),
    __metadata("design:type", String)
], PurchaseOrder.prototype, "warehouseId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_js_1.User),
    (0, typeorm_1.JoinColumn)({ name: 'created_by' }),
    __metadata("design:type", user_entity_js_1.User)
], PurchaseOrder.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_by' }),
    __metadata("design:type", String)
], PurchaseOrder.prototype, "createdById", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: purchase_order_status_enum_js_1.PurchaseOrderStatus,
        default: purchase_order_status_enum_js_1.PurchaseOrderStatus.DRAFT,
    }),
    __metadata("design:type", String)
], PurchaseOrder.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], PurchaseOrder.prototype, "total", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], PurchaseOrder.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => purchase_order_item_entity_js_1.PurchaseOrderItem, (item) => item.purchaseOrder, {
        cascade: true,
    }),
    __metadata("design:type", Array)
], PurchaseOrder.prototype, "items", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => accounts_payable_entity_js_1.AccountsPayable, (ap) => ap.purchaseOrder),
    __metadata("design:type", Array)
], PurchaseOrder.prototype, "accountsPayable", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PurchaseOrder.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PurchaseOrder.prototype, "updatedAt", void 0);
exports.PurchaseOrder = PurchaseOrder = __decorate([
    (0, typeorm_1.Entity)('purchase_orders'),
    (0, typeorm_1.Unique)(['tenantId', 'orderNumber'])
], PurchaseOrder);
//# sourceMappingURL=purchase-order.entity.js.map