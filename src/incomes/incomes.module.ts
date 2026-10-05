import { Module } from '@nestjs/common';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncomeEntry } from './entities/income-entry.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { IncomesService } from './incomes.service.js';
import { IncomesController } from './incomes.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([IncomeEntry, Bank, StoreSettings])],
  controllers: [IncomesController],
  providers: [IncomesService],
  exports: [IncomesService],
})
export class IncomesModule {}
