import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Payment } from '../pos/entities/payment.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, SaleItem, Payment, Stock])],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
