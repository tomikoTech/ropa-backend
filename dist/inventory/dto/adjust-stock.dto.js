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
exports.AdjustStockDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const movement_type_enum_js_1 = require("../../common/enums/movement-type.enum.js");
class AdjustStockDto {
    variantId;
    warehouseId;
    quantity;
    movementType;
    notes;
}
exports.AdjustStockDto = AdjustStockDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'uuid-variante' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AdjustStockDto.prototype, "variantId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'uuid-bodega' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AdjustStockDto.prototype, "warehouseId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10 }),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], AdjustStockDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: [movement_type_enum_js_1.MovementType.IN, movement_type_enum_js_1.MovementType.OUT, movement_type_enum_js_1.MovementType.ADJUSTMENT],
    }),
    (0, class_validator_1.IsEnum)(movement_type_enum_js_1.MovementType),
    __metadata("design:type", String)
], AdjustStockDto.prototype, "movementType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Ajuste de inventario inicial' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdjustStockDto.prototype, "notes", void 0);
//# sourceMappingURL=adjust-stock.dto.js.map