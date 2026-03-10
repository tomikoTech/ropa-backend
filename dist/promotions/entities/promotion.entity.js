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
exports.Promotion = void 0;
const typeorm_1 = require("typeorm");
const discount_type_enum_js_1 = require("../../common/enums/discount-type.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let Promotion = class Promotion extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    name;
    description;
    discountType;
    discountValue;
    applicableTo;
    applicableId;
    startDate;
    endDate;
    maxUses;
    currentUses;
    isActive;
    createdAt;
    updatedAt;
};
exports.Promotion = Promotion;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Promotion.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Promotion.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Promotion.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'discount_type',
        type: 'enum',
        enum: discount_type_enum_js_1.DiscountType,
    }),
    __metadata("design:type", String)
], Promotion.prototype, "discountType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'discount_value', type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], Promotion.prototype, "discountValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'applicable_to', default: 'ALL' }),
    __metadata("design:type", String)
], Promotion.prototype, "applicableTo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'applicable_id', nullable: true }),
    __metadata("design:type", String)
], Promotion.prototype, "applicableId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'start_date', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Promotion.prototype, "startDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'end_date', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Promotion.prototype, "endDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'max_uses', nullable: true }),
    __metadata("design:type", Number)
], Promotion.prototype, "maxUses", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'current_uses', default: 0 }),
    __metadata("design:type", Number)
], Promotion.prototype, "currentUses", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', default: true }),
    __metadata("design:type", Boolean)
], Promotion.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Promotion.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Promotion.prototype, "updatedAt", void 0);
exports.Promotion = Promotion = __decorate([
    (0, typeorm_1.Entity)('promotions')
], Promotion);
//# sourceMappingURL=promotion.entity.js.map