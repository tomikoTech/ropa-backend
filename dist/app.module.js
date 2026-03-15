"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const core_1 = require("@nestjs/core");
const common_2 = require("@nestjs/common");
const configuration_js_1 = __importDefault(require("./config/configuration.js"));
const database_config_js_1 = require("./config/database.config.js");
const auth_module_js_1 = require("./auth/auth.module.js");
const users_module_js_1 = require("./users/users.module.js");
const categories_module_js_1 = require("./categories/categories.module.js");
const products_module_js_1 = require("./products/products.module.js");
const inventory_module_js_1 = require("./inventory/inventory.module.js");
const clients_module_js_1 = require("./clients/clients.module.js");
const pos_module_js_1 = require("./pos/pos.module.js");
const suppliers_module_js_1 = require("./suppliers/suppliers.module.js");
const purchases_module_js_1 = require("./purchases/purchases.module.js");
const promotions_module_js_1 = require("./promotions/promotions.module.js");
const returns_module_js_1 = require("./returns/returns.module.js");
const reports_module_js_1 = require("./reports/reports.module.js");
const audit_module_js_1 = require("./audit/audit.module.js");
const tenants_module_js_1 = require("./tenants/tenants.module.js");
const storefront_module_js_1 = require("./storefront/storefront.module.js");
const common_module_js_1 = require("./common/common.module.js");
const audit_interceptor_js_1 = require("./audit/audit.interceptor.js");
const jwt_auth_guard_js_1 = require("./common/guards/jwt-auth.guard.js");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_js_1.default],
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: database_config_js_1.getDatabaseConfig,
            }),
            auth_module_js_1.AuthModule,
            users_module_js_1.UsersModule,
            categories_module_js_1.CategoriesModule,
            products_module_js_1.ProductsModule,
            inventory_module_js_1.InventoryModule,
            clients_module_js_1.ClientsModule,
            pos_module_js_1.PosModule,
            suppliers_module_js_1.SuppliersModule,
            purchases_module_js_1.PurchasesModule,
            promotions_module_js_1.PromotionsModule,
            returns_module_js_1.ReturnsModule,
            reports_module_js_1.ReportsModule,
            audit_module_js_1.AuditModule,
            tenants_module_js_1.TenantsModule,
            storefront_module_js_1.StorefrontModule,
            common_module_js_1.CommonModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_js_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: common_2.ClassSerializerInterceptor,
            },
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: audit_interceptor_js_1.AuditInterceptor,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map