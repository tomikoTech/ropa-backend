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
exports.InvoiceService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const sale_entity_js_1 = require("../entities/sale.entity.js");
let InvoiceService = class InvoiceService {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async generateSaleNumber(tenantId) {
        const today = new Date();
        const dateStr = today.getFullYear().toString() +
            String(today.getMonth() + 1).padStart(2, '0') +
            String(today.getDate()).padStart(2, '0');
        const prefix = `VTA-${dateStr}-`;
        const lastSale = await this.dataSource
            .getRepository(sale_entity_js_1.Sale)
            .createQueryBuilder('s')
            .where('s.sale_number LIKE :prefix', { prefix: `${prefix}%` })
            .andWhere('s.tenant_id = :tenantId', { tenantId })
            .orderBy('s.sale_number', 'DESC')
            .getOne();
        let nextSeq = 1;
        if (lastSale) {
            const lastSeq = parseInt(lastSale.saleNumber.split('-').pop() || '0', 10);
            nextSeq = lastSeq + 1;
        }
        return `${prefix}${String(nextSeq).padStart(4, '0')}`;
    }
    async generateInvoiceNumber(tenantId) {
        const lastSale = await this.dataSource
            .getRepository(sale_entity_js_1.Sale)
            .createQueryBuilder('s')
            .where('s.invoice_number IS NOT NULL')
            .andWhere('s.tenant_id = :tenantId', { tenantId })
            .orderBy('s.created_at', 'DESC')
            .getOne();
        let nextNum = 1;
        if (lastSale?.invoiceNumber) {
            const lastNum = parseInt(lastSale.invoiceNumber.replace('FE-', ''), 10);
            nextNum = lastNum + 1;
        }
        return `FE-${String(nextNum).padStart(6, '0')}`;
    }
};
exports.InvoiceService = InvoiceService;
exports.InvoiceService = InvoiceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], InvoiceService);
//# sourceMappingURL=invoice.service.js.map