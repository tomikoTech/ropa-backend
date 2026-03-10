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
exports.AccountsReceivablePayment = void 0;
const typeorm_1 = require("typeorm");
const accounts_receivable_entity_js_1 = require("./accounts-receivable.entity.js");
const payment_method_enum_js_1 = require("../../common/enums/payment-method.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let AccountsReceivablePayment = class AccountsReceivablePayment extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    accountReceivable;
    accountReceivableId;
    amount;
    method;
    reference;
    receiptImageUrl;
    notes;
    createdAt;
};
exports.AccountsReceivablePayment = AccountsReceivablePayment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], AccountsReceivablePayment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => accounts_receivable_entity_js_1.AccountsReceivable, (ar) => ar.payments, {
        onDelete: 'CASCADE',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'account_receivable_id' }),
    __metadata("design:type", accounts_receivable_entity_js_1.AccountsReceivable)
], AccountsReceivablePayment.prototype, "accountReceivable", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'account_receivable_id' }),
    __metadata("design:type", String)
], AccountsReceivablePayment.prototype, "accountReceivableId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", Number)
], AccountsReceivablePayment.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: payment_method_enum_js_1.PaymentMethod }),
    __metadata("design:type", String)
], AccountsReceivablePayment.prototype, "method", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], AccountsReceivablePayment.prototype, "reference", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receipt_image_url', nullable: true }),
    __metadata("design:type", String)
], AccountsReceivablePayment.prototype, "receiptImageUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], AccountsReceivablePayment.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], AccountsReceivablePayment.prototype, "createdAt", void 0);
exports.AccountsReceivablePayment = AccountsReceivablePayment = __decorate([
    (0, typeorm_1.Entity)('accounts_receivable_payments')
], AccountsReceivablePayment);
//# sourceMappingURL=accounts-receivable-payment.entity.js.map