"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const sale_entity_js_1 = require("./entities/sale.entity.js");
const sale_item_entity_js_1 = require("./entities/sale-item.entity.js");
const payment_entity_js_1 = require("./entities/payment.entity.js");
const product_variant_entity_js_1 = require("../products/entities/product-variant.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const stock_movement_entity_js_1 = require("../inventory/entities/stock-movement.entity.js");
const accounts_receivable_entity_js_1 = require("./entities/accounts-receivable.entity.js");
const accounts_receivable_payment_entity_js_1 = require("./entities/accounts-receivable-payment.entity.js");
const store_settings_entity_js_1 = require("../storefront/entities/store-settings.entity.js");
const pos_service_js_1 = require("./pos.service.js");
const pos_controller_js_1 = require("./pos.controller.js");
const tax_service_js_1 = require("./services/tax.service.js");
const invoice_service_js_1 = require("./services/invoice.service.js");
const receipt_service_js_1 = require("./services/receipt.service.js");
const clients_module_js_1 = require("../clients/clients.module.js");
let PosModule = class PosModule {
};
exports.PosModule = PosModule;
exports.PosModule = PosModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                sale_entity_js_1.Sale,
                sale_item_entity_js_1.SaleItem,
                payment_entity_js_1.Payment,
                product_variant_entity_js_1.ProductVariant,
                stock_entity_js_1.Stock,
                stock_movement_entity_js_1.StockMovement,
                accounts_receivable_entity_js_1.AccountsReceivable,
                accounts_receivable_payment_entity_js_1.AccountsReceivablePayment,
                store_settings_entity_js_1.StoreSettings,
            ]),
            clients_module_js_1.ClientsModule,
        ],
        controllers: [pos_controller_js_1.PosController],
        providers: [pos_service_js_1.PosService, tax_service_js_1.TaxService, invoice_service_js_1.InvoiceService, receipt_service_js_1.ReceiptService],
        exports: [pos_service_js_1.PosService],
    })
], PosModule);
//# sourceMappingURL=pos.module.js.map