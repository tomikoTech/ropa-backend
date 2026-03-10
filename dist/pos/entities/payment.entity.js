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
exports.Payment = void 0;
const typeorm_1 = require("typeorm");
const sale_entity_js_1 = require("./sale.entity.js");
const payment_method_enum_js_1 = require("../../common/enums/payment-method.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let Payment = class Payment extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    sale;
    saleId;
    method;
    amount;
    reference;
    receivedAmount;
    changeAmount;
    createdAt;
};
exports.Payment = Payment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Payment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => sale_entity_js_1.Sale, (sale) => sale.payments, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'sale_id' }),
    __metadata("design:type", sale_entity_js_1.Sale)
], Payment.prototype, "sale", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sale_id' }),
    __metadata("design:type", String)
], Payment.prototype, "saleId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: payment_method_enum_js_1.PaymentMethod,
    }),
    __metadata("design:type", String)
], Payment.prototype, "method", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'decimal',
        precision: 14,
        scale: 2,
    }),
    __metadata("design:type", Number)
], Payment.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Payment.prototype, "reference", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'received_amount',
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], Payment.prototype, "receivedAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'change_amount',
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], Payment.prototype, "changeAmount", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Payment.prototype, "createdAt", void 0);
exports.Payment = Payment = __decorate([
    (0, typeorm_1.Entity)('payments')
], Payment);
//# sourceMappingURL=payment.entity.js.map