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
exports.CreditNote = void 0;
const typeorm_1 = require("typeorm");
const return_entity_js_1 = require("./return.entity.js");
const tenant_aware_entity_js_1 = require("../../common/entities/tenant-aware.entity.js");
let CreditNote = class CreditNote extends tenant_aware_entity_js_1.TenantAwareEntity {
    id;
    creditNoteNumber;
    return;
    returnId;
    amount;
    isApplied;
    notes;
    createdAt;
};
exports.CreditNote = CreditNote;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], CreditNote.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'credit_note_number' }),
    __metadata("design:type", String)
], CreditNote.prototype, "creditNoteNumber", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => return_entity_js_1.Return, (r) => r.creditNotes, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'return_id' }),
    __metadata("design:type", return_entity_js_1.Return)
], CreditNote.prototype, "return", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'return_id' }),
    __metadata("design:type", String)
], CreditNote.prototype, "returnId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", Number)
], CreditNote.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_applied', default: false }),
    __metadata("design:type", Boolean)
], CreditNote.prototype, "isApplied", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], CreditNote.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], CreditNote.prototype, "createdAt", void 0);
exports.CreditNote = CreditNote = __decorate([
    (0, typeorm_1.Entity)('credit_notes'),
    (0, typeorm_1.Unique)(['tenantId', 'creditNoteNumber'])
], CreditNote);
//# sourceMappingURL=credit-note.entity.js.map