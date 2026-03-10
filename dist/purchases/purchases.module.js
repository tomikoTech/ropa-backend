"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchasesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const purchase_order_entity_js_1 = require("./entities/purchase-order.entity.js");
const purchase_order_item_entity_js_1 = require("./entities/purchase-order-item.entity.js");
const accounts_payable_entity_js_1 = require("./entities/accounts-payable.entity.js");
const product_variant_entity_js_1 = require("../products/entities/product-variant.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const stock_movement_entity_js_1 = require("../inventory/entities/stock-movement.entity.js");
const purchases_service_js_1 = require("./purchases.service.js");
const purchases_controller_js_1 = require("./purchases.controller.js");
let PurchasesModule = class PurchasesModule {
};
exports.PurchasesModule = PurchasesModule;
exports.PurchasesModule = PurchasesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                purchase_order_entity_js_1.PurchaseOrder,
                purchase_order_item_entity_js_1.PurchaseOrderItem,
                accounts_payable_entity_js_1.AccountsPayable,
                product_variant_entity_js_1.ProductVariant,
                stock_entity_js_1.Stock,
                stock_movement_entity_js_1.StockMovement,
            ]),
        ],
        controllers: [purchases_controller_js_1.PurchasesController],
        providers: [purchases_service_js_1.PurchasesService],
        exports: [purchases_service_js_1.PurchasesService],
    })
], PurchasesModule);
//# sourceMappingURL=purchases.module.js.map