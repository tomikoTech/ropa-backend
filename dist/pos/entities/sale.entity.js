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
exports.Sale = void 0;
const typeorm_1 = require("typeorm");
const client_entity_js_1 = require("../../clients/entities/client.entity.js");
const user_entity_js_1 = require("../../users/entities/user.entity.js");
const warehouse_entity_js_1 = require("../../inventory/entities/warehouse.entity.js");
const sale_item_entity_js_1 = require("./sale-item.entity.js");
const payment_entity_js_1 = require("./payment.entity.js");
const accounts_receivable_entity_js_1 = require("./accounts-receivable.entity.js");
const sale_status_enum_js_1 = require("../../common/enums/sale-status.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let Sale = class Sale extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    saleNumber;
    invoiceNumber;
    client;
    clientId;
    user;
    userId;
    warehouse;
    warehouseId;
    subtotal;
    discountAmount;
    taxAmount;
    total;
    status;
    notes;
    items;
    payments;
    accountsReceivable;
    createdAt;
    updatedAt;
};
exports.Sale = Sale;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Sale.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sale_number' }),
    __metadata("design:type", String)
], Sale.prototype, "saleNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'invoice_number', nullable: true }),
    __metadata("design:type", String)
], Sale.prototype, "invoiceNumber", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => client_entity_js_1.Client, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'client_id' }),
    __metadata("design:type", client_entity_js_1.Client)
], Sale.prototype, "client", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'client_id', nullable: true }),
    __metadata("design:type", String)
], Sale.prototype, "clientId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_js_1.User),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_js_1.User)
], Sale.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id' }),
    __metadata("design:type", String)
], Sale.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => warehouse_entity_js_1.Warehouse),
    (0, typeorm_1.JoinColumn)({ name: 'warehouse_id' }),
    __metadata("design:type", warehouse_entity_js_1.Warehouse)
], Sale.prototype, "warehouse", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'warehouse_id' }),
    __metadata("design:type", String)
], Sale.prototype, "warehouseId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], Sale.prototype, "subtotal", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'discount_amount',
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], Sale.prototype, "discountAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'tax_amount',
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], Sale.prototype, "taxAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], Sale.prototype, "total", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: sale_status_enum_js_1.SaleStatus,
        default: sale_status_enum_js_1.SaleStatus.PENDING,
    }),
    __metadata("design:type", String)
], Sale.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Sale.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => sale_item_entity_js_1.SaleItem, (item) => item.sale, { cascade: true }),
    __metadata("design:type", Array)
], Sale.prototype, "items", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => payment_entity_js_1.Payment, (payment) => payment.sale, { cascade: true }),
    __metadata("design:type", Array)
], Sale.prototype, "payments", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => accounts_receivable_entity_js_1.AccountsReceivable, (ar) => ar.sale),
    __metadata("design:type", Array)
], Sale.prototype, "accountsReceivable", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Sale.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Sale.prototype, "updatedAt", void 0);
exports.Sale = Sale = __decorate([
    (0, typeorm_1.Entity)('sales'),
    (0, typeorm_1.Unique)(['tenantId', 'saleNumber']),
    (0, typeorm_1.Unique)(['tenantId', 'invoiceNumber'])
], Sale);
//# sourceMappingURL=sale.entity.js.map