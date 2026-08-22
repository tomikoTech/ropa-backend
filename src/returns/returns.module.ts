import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Return } from './entities/return.entity.js';
import { ReturnItem } from './entities/return-item.entity.js';
import { CreditNote } from './entities/credit-note.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { StockUnit } from '../inventory/entities/stock-unit.entity.js';
import { StockUnitEvent } from '../inventory/entities/stock-unit-event.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { IncomeEntry } from '../incomes/entities/income-entry.entity.js';
import { AccountsReceivable } from '../pos/entities/accounts-receivable.entity.js';
import { ReturnsService } from './returns.service.js';
import { ReturnsController } from './returns.controller.js';
import { StockLedgerModule } from '../inventory/ledger/stock-ledger.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Return,
      ReturnItem,
      CreditNote,
      Sale,
      SaleItem,
      Stock,
      StockMovement,
      StockUnit,
      StockUnitEvent,
      Warehouse,
      User,
      Bank,
      IncomeEntry,
      AccountsReceivable,
    ]),
    StockLedgerModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
