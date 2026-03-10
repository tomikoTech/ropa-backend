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
exports.ReceiveItemsDto = exports.ReceiveItemDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class ReceiveItemDto {
    itemId;
    quantityReceived;
}
exports.ReceiveItemDto = ReceiveItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del item de la orden' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ReceiveItemDto.prototype, "itemId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 5, description: 'Cantidad recibida' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ReceiveItemDto.prototype, "quantityReceived", void 0);
class ReceiveItemsDto {
    items;
}
exports.ReceiveItemsDto = ReceiveItemsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ReceiveItemDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ReceiveItemDto),
    __metadata("design:type", Array)
], ReceiveItemsDto.prototype, "items", void 0);
//# sourceMappingURL=receive-items.dto.js.map