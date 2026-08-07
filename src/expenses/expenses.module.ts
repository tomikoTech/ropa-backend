import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from './entities/expense.entity.js';
import { ExpenseCategory } from './entities/expense-category.entity.js';
import { PettyCash } from './entities/petty-cash.entity.js';
import { ExpensesService } from './expenses.service.js';
import { ExpensesController } from './expenses.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, ExpenseCategory, PettyCash])],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
