import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Return } from './entities/return.entity.js';
import { ReturnItem } from './entities/return-item.entity.js';
import { CreditNote } from './entities/credit-note.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { CreateReturnDto } from './dto/create-return.dto.js';
import { ReturnStatus } from '../common/enums/return-status.enum.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { MovementType } from '../common/enums/movement-type.enum.js';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(Return)
    private readonly returnRepository: Repository<Return>,
    @InjectRepository(CreditNote)
    private readonly creditNoteRepository: Repository<CreditNote>,
    private readonly dataSource: DataSource,
  ) {}

  private async generateReturnNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const prefix = `DEV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const count = await this.returnRepository
      .createQueryBuilder('r')
      .where('r.return_number LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('r.tenant_id = :tenantId', { tenantId })
      .getCount();
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  private async generateCreditNoteNumber(tenantId: string): Promise<string> {
    const count = await this.creditNoteRepository.count({
      where: { tenantId },
    });
    return `NC-${String(count + 1).padStart(6, '0')}`;
  }

  /**
   * Create a return: validate sale, create return + items,
   * restore inventory, create credit note — all in a transaction.
   */
  async create(dto: CreateReturnDto, userId: string, tenantId: string): Promise<Return> {
    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const saleItemRepo = manager.getRepository(SaleItem);
      const returnRepo = manager.getRepository(Return);
      const returnItemRepo = manager.getRepository(ReturnItem);
      const creditNoteRepo = manager.getRepository(CreditNote);
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      // Validate sale
      const sale = await saleRepo.findOne({
        where: { id: dto.saleId, tenantId },
        relations: ['items', 'client'],
      });
      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException('Solo se pueden devolver ventas completadas');
      }

      const returnNumber = await this.generateReturnNumber(tenantId);
      let refundAmount = 0;

      // Validate items and calculate refund
      const returnItemsData: { saleItem: SaleItem; quantity: number }[] = [];

      for (const itemDto of dto.items) {
        const saleItem = sale.items.find((i) => i.id === itemDto.saleItemId);
        if (!saleItem) {
          throw new NotFoundException(`Item de venta ${itemDto.saleItemId} no encontrado`);
        }
        if (itemDto.quantity > saleItem.quantity) {
          throw new BadRequestException(
            `Cantidad a devolver (${itemDto.quantity}) excede la vendida (${saleItem.quantity}) para "${saleItem.productName}"`,
          );
        }
        returnItemsData.push({ saleItem, quantity: itemDto.quantity });
        refundAmount += itemDto.quantity * Number(saleItem.unitPrice);
      }

      // Create return
      const returnEntity = returnRepo.create({
        returnNumber,
        saleId: sale.id,
        clientId: sale.clientId,
        userId,
        reason: dto.reason,
        status: ReturnStatus.COMPLETED,
        refundAmount,
        tenantId,
      });
      const savedReturn = await returnRepo.save(returnEntity);

      // Create return items + restore inventory
      for (const { saleItem, quantity } of returnItemsData) {
        const ri = returnItemRepo.create({
          returnId: savedReturn.id,
          saleItemId: saleItem.id,
          variantId: saleItem.variantId,
          quantity,
          unitPrice: saleItem.unitPrice,
          tenantId,
        });
        await returnItemRepo.save(ri);

        // Restore stock
        const stock = await stockRepo.findOne({
          where: { variantId: saleItem.variantId, warehouseId: sale.warehouseId, tenantId },
        });
        if (stock) {
          stock.quantity += quantity;
          await stockRepo.save(stock);
        }

        // Record movement
        const movement = movementRepo.create({
          variantId: saleItem.variantId,
          warehouseId: sale.warehouseId,
          movementType: MovementType.IN,
          quantity,
          referenceType: 'RETURN',
          referenceId: savedReturn.id,
          notes: `Devolución ${returnNumber}`,
          createdById: userId,
          tenantId,
        });
        await movementRepo.save(movement);
      }

      // Create credit note
      const cnNumber = await this.generateCreditNoteNumber(tenantId);
      const creditNote = creditNoteRepo.create({
        creditNoteNumber: cnNumber,
        returnId: savedReturn.id,
        amount: refundAmount,
        notes: `Nota crédito por devolución ${returnNumber}`,
        tenantId,
      });
      await creditNoteRepo.save(creditNote);

      // Return full entity
      const fullReturn = await returnRepo.findOne({
        where: { id: savedReturn.id, tenantId },
        relations: ['sale', 'client', 'user', 'items', 'items.variant', 'creditNotes'],
      });
      if (!fullReturn) {
        throw new NotFoundException('Devolución no encontrada después de crear');
      }
      return fullReturn;
    });
  }

  async findAll(tenantId: string): Promise<Return[]> {
    return this.returnRepository.find({
      where: { tenantId },
      relations: ['sale', 'client', 'user', 'items', 'creditNotes'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Return> {
    const ret = await this.returnRepository.findOne({
      where: { id, tenantId },
      relations: ['sale', 'client', 'user', 'items', 'items.variant', 'items.saleItem', 'creditNotes'],
    });
    if (!ret) {
      throw new NotFoundException('Devolución no encontrada');
    }
    return ret;
  }

  async findCreditNotes(tenantId: string): Promise<CreditNote[]> {
    return this.creditNoteRepository.find({
      where: { tenantId },
      relations: ['return', 'return.sale', 'return.client'],
      order: { createdAt: 'DESC' },
    });
  }
}
