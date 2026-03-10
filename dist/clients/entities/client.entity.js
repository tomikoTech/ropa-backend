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
exports.Client = void 0;
const typeorm_1 = require("typeorm");
const document_type_enum_js_1 = require("../../common/enums/document-type.enum.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let Client = class Client extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    firstName;
    lastName;
    documentType;
    documentNumber;
    email;
    phone;
    address;
    isGeneric;
    isActive;
    createdAt;
    updatedAt;
};
exports.Client = Client;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Client.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'first_name' }),
    __metadata("design:type", String)
], Client.prototype, "firstName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_name' }),
    __metadata("design:type", String)
], Client.prototype, "lastName", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'document_type',
        type: 'enum',
        enum: document_type_enum_js_1.DocumentType,
        default: document_type_enum_js_1.DocumentType.CC,
    }),
    __metadata("design:type", String)
], Client.prototype, "documentType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'document_number', nullable: true }),
    __metadata("design:type", String)
], Client.prototype, "documentNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Client.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Client.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Client.prototype, "address", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_generic', default: false }),
    __metadata("design:type", Boolean)
], Client.prototype, "isGeneric", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', default: true }),
    __metadata("design:type", Boolean)
], Client.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Client.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Client.prototype, "updatedAt", void 0);
exports.Client = Client = __decorate([
    (0, typeorm_1.Entity)('clients')
], Client);
//# sourceMappingURL=client.entity.js.map