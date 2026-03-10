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
exports.StockMovement = void 0;
const typeorm_1 = require("typeorm");
const product_variant_entity_js_1 = require("../../products/entities/product-variant.entity.js");
const warehouse_entity_js_1 = require("./warehouse.entity.js");
const user_entity_js_1 = require("../../users/entities/user.entity.js");
const movement_type_enum_js_1 = require("../../common/enums/movement-type.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let StockMovement = class StockMovement extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    variant;
    variantId;
    warehouse;
    warehouseId;
    movementType;
    quantity;
    referenceType;
    referenceId;
    notes;
    createdBy;
    createdById;
    createdAt;
};
exports.StockMovement = StockMovement;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], StockMovement.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => product_variant_entity_js_1.ProductVariant, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'variant_id' }),
    __metadata("design:type", product_variant_entity_js_1.ProductVariant)
], StockMovement.prototype, "variant", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variant_id' }),
    __metadata("design:type", String)
], StockMovement.prototype, "variantId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => warehouse_entity_js_1.Warehouse, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'warehouse_id' }),
    __metadata("design:type", warehouse_entity_js_1.Warehouse)
], StockMovement.prototype, "warehouse", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'warehouse_id' }),
    __metadata("design:type", String)
], StockMovement.prototype, "warehouseId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'movement_type',
        type: 'enum',
        enum: movement_type_enum_js_1.MovementType,
    }),
    __metadata("design:type", String)
], StockMovement.prototype, "movementType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], StockMovement.prototype, "quantity", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reference_type', nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "referenceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reference_id', nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "referenceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_js_1.User, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'created_by' }),
    __metadata("design:type", user_entity_js_1.User)
], StockMovement.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_by', nullable: true }),
    __metadata("design:type", String)
], StockMovement.prototype, "createdById", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], StockMovement.prototype, "createdAt", void 0);
exports.StockMovement = StockMovement = __decorate([
    (0, typeorm_1.Entity)('stock_movements')
], StockMovement);
//# sourceMappingURL=stock-movement.entity.js.map