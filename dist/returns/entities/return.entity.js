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
exports.Return = void 0;
const typeorm_1 = require("typeorm");
const sale_entity_js_1 = require("../../pos/entities/sale.entity.js");
const client_entity_js_1 = require("../../clients/entities/client.entity.js");
const user_entity_js_1 = require("../../users/entities/user.entity.js");
const return_item_entity_js_1 = require("./return-item.entity.js");
const credit_note_entity_js_1 = require("./credit-note.entity.js");
const return_status_enum_js_1 = require("../../common/enums/return-status.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let Return = class Return extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    returnNumber;
    sale;
    saleId;
    client;
    clientId;
    user;
    userId;
    reason;
    status;
    refundAmount;
    items;
    creditNotes;
    createdAt;
    updatedAt;
};
exports.Return = Return;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Return.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'return_number' }),
    __metadata("design:type", String)
], Return.prototype, "returnNumber", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => sale_entity_js_1.Sale),
    (0, typeorm_1.JoinColumn)({ name: 'sale_id' }),
    __metadata("design:type", sale_entity_js_1.Sale)
], Return.prototype, "sale", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sale_id' }),
    __metadata("design:type", String)
], Return.prototype, "saleId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => client_entity_js_1.Client),
    (0, typeorm_1.JoinColumn)({ name: 'client_id' }),
    __metadata("design:type", client_entity_js_1.Client)
], Return.prototype, "client", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'client_id' }),
    __metadata("design:type", String)
], Return.prototype, "clientId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_js_1.User),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_js_1.User)
], Return.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id' }),
    __metadata("design:type", String)
], Return.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Return.prototype, "reason", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: return_status_enum_js_1.ReturnStatus,
        default: return_status_enum_js_1.ReturnStatus.PENDING,
    }),
    __metadata("design:type", String)
], Return.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'refund_amount',
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
    }),
    __metadata("design:type", Number)
], Return.prototype, "refundAmount", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => return_item_entity_js_1.ReturnItem, (item) => item.return, { cascade: true }),
    __metadata("design:type", Array)
], Return.prototype, "items", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => credit_note_entity_js_1.CreditNote, (cn) => cn.return),
    __metadata("design:type", Array)
], Return.prototype, "creditNotes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Return.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Return.prototype, "updatedAt", void 0);
exports.Return = Return = __decorate([
    (0, typeorm_1.Entity)('returns'),
    (0, typeorm_1.Unique)(['tenantId', 'returnNumber'])
], Return);
//# sourceMappingURL=return.entity.js.map