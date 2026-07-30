import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncomeEntry } from './entities/income-entry.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { IncomesService } from './incomes.service.js';
import { IncomesController } from './incomes.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([IncomeEntry, Bank])],
  controllers: [IncomesController],
  providers: [IncomesService],
  exports: [IncomesService],
})
export class IncomesModule {}
