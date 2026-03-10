import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Return } from './entities/return.entity.js';
import { ReturnItem } from './entities/return-item.entity.js';
import { CreditNote } from './entities/credit-note.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { ReturnsService } from './returns.service.js';
import { ReturnsController } from './returns.controller.js';

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
    ]),
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
