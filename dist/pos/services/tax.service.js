"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaxService = void 0;
const common_1 = require("@nestjs/common");
let TaxService = class TaxService {
    calculateLine(unitPrice, quantity, discountPercent, taxRate) {
        const subtotalBeforeDiscount = unitPrice * quantity;
        const discountAmount = subtotalBeforeDiscount * (discountPercent / 100);
        const totalAfterDiscount = subtotalBeforeDiscount - discountAmount;
        const taxableBase = totalAfterDiscount / (1 + taxRate / 100);
        const taxAmount = totalAfterDiscount - taxableBase;
        return {
            unitPrice,
            quantity,
            discountPercent,
            taxRate,
            subtotalBeforeDiscount: this.round(subtotalBeforeDiscount),
            discountAmount: this.round(discountAmount),
            taxableBase: this.round(taxableBase),
            taxAmount: this.round(taxAmount),
            lineTotal: this.round(totalAfterDiscount),
        };
    }
    calculateSaleTotals(lines) {
        const subtotal = lines.reduce((sum, l) => sum + l.subtotalBeforeDiscount, 0);
        const discountAmount = lines.reduce((sum, l) => sum + l.discountAmount, 0);
        const taxAmount = lines.reduce((sum, l) => sum + l.taxAmount, 0);
        const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
        return {
            subtotal: this.round(subtotal),
            discountAmount: this.round(discountAmount),
            taxableBase: this.round(subtotal - discountAmount - taxAmount),
            taxAmount: this.round(taxAmount),
            total: this.round(total),
        };
    }
    round(value) {
        return Math.round(value * 100) / 100;
    }
};
exports.TaxService = TaxService;
exports.TaxService = TaxService = __decorate([
    (0, common_1.Injectable)()
], TaxService);
//# sourceMappingURL=tax.service.js.map