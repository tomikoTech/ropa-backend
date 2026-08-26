import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import configuration from './config/configuration.js';
import { getDatabaseConfig } from './config/database.config.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { BrandsModule } from './brands/brands.module.js';
import { CatalogsModule } from './catalogs/catalogs.module.js';
import { VouchersModule } from './vouchers/vouchers.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { ConsignmentsModule } from './consignments/consignments.module.js';
import { ProductsModule } from './products/products.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { PosModule } from './pos/pos.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { PromotionsModule } from './promotions/promotions.module.js';
import { ReturnsModule } from './returns/returns.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { AuditModule } from './audit/audit.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { StorefrontModule } from './storefront/storefront.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ProductionModule } from './production/production.module.js';
import { AdminModule } from './admin/admin.module.js';
import { BanksModule } from './banks/banks.module.js';
import { IncomesModule } from './incomes/incomes.module.js';
import { CajaModule } from './caja/caja.module.js';
import { QuotationsModule } from './quotations/quotations.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';
import { CommonModule } from './common/common.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { StreetModule } from './street/street.module.js';
import { PromotersModule } from './promoters/promoters.module.js';
import { InternalRequestsModule } from './internal-requests/internal-requests.module.js';
import { AuditInterceptor } from './audit/audit.interceptor.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { AccessModule } from './access/access.module.js';
import { PermissionsGuard } from './access/permissions.guard.js';
import { CostVisibilityInterceptor } from './access/cost-visibility.interceptor.js';
import { WarehouseScopeGuard } from './access/warehouse-scope.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Freno por IP. El límite global es holgado (uso normal ni lo roza); su
    // razón de ser es cortar el scraping y, sobre todo, la fuerza bruta contra
    // `/auth/login`, que además lleva su propio límite estricto. `skipIf` deja
    // apagarlo en los E2E, que disparan cientos de peticiones desde una sola IP.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 200 }],
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    BrandsModule,
    CatalogsModule,
    VouchersModule,
    ExpensesModule,
    ConsignmentsModule,
    ProductsModule,
    InventoryModule,
    ClientsModule,
    PosModule,
    SuppliersModule,
    PurchasesModule,
    PromotionsModule,
    ReturnsModule,
    ReportsModule,
    AuditModule,
    TenantsModule,
    StorefrontModule,
    PaymentsModule,
    ProductionModule,
    AdminModule,
    BanksModule,
    IncomesModule,
    CajaModule,
    QuotationsModule,
    ReservationsModule,
    CommonModule,
    UploadsModule,
    AccessModule,
    StreetModule,
    PromotersModule,
    InternalRequestsModule,
  ],
  providers: [
    // Va PRIMERO: frenar por IP antes de resolver el JWT o tocar la base. Un
    // ataque de fuerza bruta no debe llegar siquiera a consultar el usuario.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Va DESPUÉS del de JWT a propósito: los guards globales corren en el orden
    // en que se registran, así que este ya encuentra el usuario resuelto.
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    // Bodegas por usuario: después del de permisos, porque primero se decide si
    // puede hacer la operación y luego dónde.
    {
      provide: APP_GUARD,
      useClass: WarehouseScopeGuard,
    },
    // Va PRIMERO: los interceptores globales se componen de fuera hacia dentro,
    // así que el primero registrado ve la respuesta ya serializada (objetos
    // planos) y puede limpiarla.
    {
      provide: APP_INTERCEPTOR,
      useClass: CostVisibilityInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
