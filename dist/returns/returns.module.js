"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReturnsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const return_entity_js_1 = require("./entities/return.entity.js");
const return_item_entity_js_1 = require("./entities/return-item.entity.js");
const credit_note_entity_js_1 = require("./entities/credit-note.entity.js");
const sale_entity_js_1 = require("../pos/entities/sale.entity.js");
const sale_item_entity_js_1 = require("../pos/entities/sale-item.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const stock_movement_entity_js_1 = require("../inventory/entities/stock-movement.entity.js");
const returns_service_js_1 = require("./returns.service.js");
const returns_controller_js_1 = require("./returns.controller.js");
let ReturnsModule = class ReturnsModule {
};
exports.ReturnsModule = ReturnsModule;
exports.ReturnsModule = ReturnsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                return_entity_js_1.Return,
                return_item_entity_js_1.ReturnItem,
                credit_note_entity_js_1.CreditNote,
                sale_entity_js_1.Sale,
                sale_item_entity_js_1.SaleItem,
                stock_entity_js_1.Stock,
                stock_movement_entity_js_1.StockMovement,
            ]),
        ],
        controllers: [returns_controller_js_1.ReturnsController],
        providers: [returns_service_js_1.ReturnsService],
        exports: [returns_service_js_1.ReturnsService],
    })
], ReturnsModule);
//# sourceMappingURL=returns.module.js.map