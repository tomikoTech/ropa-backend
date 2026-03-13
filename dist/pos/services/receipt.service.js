"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiptService = void 0;
const common_1 = require("@nestjs/common");
let ReceiptService = class ReceiptService {
    generateReceipt(sale) {
        const saleDate = new Date(sale.createdAt);
        return {
            storeName: 'TOMIKO ROPA',
            storeNit: '900.000.000-0',
            saleNumber: sale.saleNumber,
            invoiceNumber: sale.invoiceNumber || '',
            date: saleDate.toLocaleDateString('es-CO'),
            time: saleDate.toLocaleTimeString('es-CO'),
            seller: sale.user ? `${sale.user.firstName} ${sale.user.lastName}` : '',
            client: sale.client
                ? `${sale.client.firstName} ${sale.client.lastName}`
                : 'Consumidor Final',
            clientDocument: sale.client?.documentNumber || '',
            warehouse: sale.warehouse?.name || '',
            items: (sale.items || []).map((item) => ({
                name: item.productName,
                sku: item.variantSku,
                size: item.variantSize,
                color: item.variantColor,
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                discount: Number(item.discountPercent),
                total: Number(item.lineTotal),
            })),
            subtotal: Number(sale.subtotal),
            discountAmount: Number(sale.discountAmount),
            taxAmount: Number(sale.taxAmount),
            total: Number(sale.total),
            payments: (sale.payments || []).map((p) => ({
                method: p.method,
                amount: Number(p.amount),
                received: Number(p.receivedAmount),
                change: Number(p.changeAmount),
                reference: p.reference || undefined,
            })),
            notes: sale.notes || undefined,
        };
    }
};
exports.ReceiptService = ReceiptService;
exports.ReceiptService = ReceiptService = __decorate([
    (0, common_1.Injectable)()
], ReceiptService);
//# sourceMappingURL=receipt.service.js.map