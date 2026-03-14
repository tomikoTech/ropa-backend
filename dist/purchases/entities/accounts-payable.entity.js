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
exports.AccountsPayable = void 0;
const typeorm_1 = require("typeorm");
const purchase_order_entity_js_1 = require("./purchase-order.entity.js");
const accounts_payable_payment_entity_js_1 = require("./accounts-payable-payment.entity.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let AccountsPayable = class AccountsPayable extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    purchaseOrder;
    purchaseOrderId;
    amount;
    paidAmount;
    dueDate;
    isPaid;
    paidAt;
    notes;
    receiptImageUrl;
    createdAt;
    payments;
    updatedAt;
};
exports.AccountsPayable = AccountsPayable;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], AccountsPayable.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => purchase_order_entity_js_1.PurchaseOrder, (po) => po.accountsPayable, {
        onDelete: 'CASCADE',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'purchase_order_id' }),
    __metadata("design:type", purchase_order_entity_js_1.PurchaseOrder)
], AccountsPayable.prototype, "purchaseOrder", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'purchase_order_id' }),
    __metadata("design:type", String)
], AccountsPayable.prototype, "purchaseOrderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", Number)
], AccountsPayable.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'paid_amount', type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], AccountsPayable.prototype, "paidAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'due_date', type: 'date' }),
    __metadata("design:type", Date)
], AccountsPayable.prototype, "dueDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_paid', default: false }),
    __metadata("design:type", Boolean)
], AccountsPayable.prototype, "isPaid", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'paid_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], AccountsPayable.prototype, "paidAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], AccountsPayable.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receipt_image_url', nullable: true }),
    __metadata("design:type", String)
], AccountsPayable.prototype, "receiptImageUrl", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], AccountsPayable.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => accounts_payable_payment_entity_js_1.AccountsPayablePayment, (p) => p.accountsPayable),
    __metadata("design:type", Array)
], AccountsPayable.prototype, "payments", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], AccountsPayable.prototype, "updatedAt", void 0);
exports.AccountsPayable = AccountsPayable = __decorate([
    (0, typeorm_1.Entity)('accounts_payable')
], AccountsPayable);
//# sourceMappingURL=accounts-payable.entity.js.map