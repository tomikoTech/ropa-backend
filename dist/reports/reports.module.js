"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const sale_entity_js_1 = require("../pos/entities/sale.entity.js");
const sale_item_entity_js_1 = require("../pos/entities/sale-item.entity.js");
const payment_entity_js_1 = require("../pos/entities/payment.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const reports_service_js_1 = require("./reports.service.js");
const reports_controller_js_1 = require("./reports.controller.js");
let ReportsModule = class ReportsModule {
};
exports.ReportsModule = ReportsModule;
exports.ReportsModule = ReportsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([sale_entity_js_1.Sale, sale_item_entity_js_1.SaleItem, payment_entity_js_1.Payment, stock_entity_js_1.Stock])],
        controllers: [reports_controller_js_1.ReportsController],
        providers: [reports_service_js_1.ReportsService],
        exports: [reports_service_js_1.ReportsService],
    })
], ReportsModule);
//# sourceMappingURL=reports.module.js.map