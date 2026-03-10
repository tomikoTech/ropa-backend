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
exports.AccountsReceivable = void 0;
const typeorm_1 = require("typeorm");
const sale_entity_js_1 = require("./sale.entity.js");
const client_entity_js_1 = require("../../clients/entities/client.entity.js");
const accounts_receivable_payment_entity_js_1 = require("./accounts-receivable-payment.entity.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let AccountsReceivable = class AccountsReceivable extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    sale;
    saleId;
    client;
    clientId;
    totalAmount;
    paidAmount;
    dueDate;
    isFullyPaid;
    fullyPaidAt;
    notes;
    payments;
    createdAt;
    updatedAt;
};
exports.AccountsReceivable = AccountsReceivable;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], AccountsReceivable.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => sale_entity_js_1.Sale, (sale) => sale.accountsReceivable, {
        onDelete: 'CASCADE',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'sale_id' }),
    __metadata("design:type", sale_entity_js_1.Sale)
], AccountsReceivable.prototype, "sale", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sale_id' }),
    __metadata("design:type", String)
], AccountsReceivable.prototype, "saleId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => client_entity_js_1.Client),
    (0, typeorm_1.JoinColumn)({ name: 'client_id' }),
    __metadata("design:type", client_entity_js_1.Client)
], AccountsReceivable.prototype, "client", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'client_id' }),
    __metadata("design:type", String)
], AccountsReceivable.prototype, "clientId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'total_amount',
        type: 'decimal',
        precision: 14,
        scale: 2,
    }),
    __metadata("design:type", Number)
], AccountsReceivable.prototype, "totalAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'paid_amount',
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], AccountsReceivable.prototype, "paidAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'due_date', type: 'date' }),
    __metadata("design:type", Date)
], AccountsReceivable.prototype, "dueDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_fully_paid', default: false }),
    __metadata("design:type", Boolean)
], AccountsReceivable.prototype, "isFullyPaid", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fully_paid_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], AccountsReceivable.prototype, "fullyPaidAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], AccountsReceivable.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => accounts_receivable_payment_entity_js_1.AccountsReceivablePayment, (p) => p.accountReceivable, {
        cascade: true,
    }),
    __metadata("design:type", Array)
], AccountsReceivable.prototype, "payments", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], AccountsReceivable.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], AccountsReceivable.prototype, "updatedAt", void 0);
exports.AccountsReceivable = AccountsReceivable = __decorate([
    (0, typeorm_1.Entity)('accounts_receivable')
], AccountsReceivable);
//# sourceMappingURL=accounts-receivable.entity.js.map