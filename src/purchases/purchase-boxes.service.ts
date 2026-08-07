import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity.js';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity.js';
import { PurchaseBoxLine } from './entities/purchase-box-line.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { Color } from '../catalogs/entities/color.entity.js';
import { SizeCurve } from '../catalogs/entities/size-curve.entity.js';
import { SizeCurveItem } from '../catalogs/entities/size-curve-item.entity.js';
import { calculateLandedCost, LandedCostResult } from './landed-cost.util.js';
import {
  CreateBoxLineDto,
  UpdateBoxLineDto,
  UpdateImportCostsDto,
} from './dto/purchase-box.dto.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';

@Injectable()
export class PurchaseBoxesService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly orderRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly itemRepo: Repository<PurchaseOrderItem>,
    @InjectRepository(PurchaseBoxLine)
    private readonly boxRepo: Repository<PurchaseBoxLine>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Color)
    private readonly colorRepo: Repository<Color>,
    @InjectRepository(SizeCurve)
    private readonly curveRepo: Repository<SizeCurve>,
    @InjectRepository(SizeCurveItem)
    private readonly curveItemRepo: Repository<SizeCurveItem>,
  ) {}

  private async getOrder(id: string, tenantId: string): Promise<PurchaseOrder> {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Orden de compra no encontrada');
    return order;
  }

  /**
   * Valida que la curva cuadre con las unidades por caja.
   *
   * Si la caja dice 24 pares pero la curva reparte 18, el detallado dejaría 6
   * unidades sin talla. Es el aviso "la suma excede el máximo" del sistema
   * anterior, aquí como validación de servidor.
   */
  private async assertCurveMatchesBox(
    sizeCurveId: string,
    unitsPerBox: number,
    tenantId: string,
  ): Promise<void> {
    const curve = await this.curveRepo.findOne({
      where: { id: sizeCurveId, tenantId },
    });
    if (!curve) throw new NotFoundException('Curva de tallas no encontrada');

    const items = await this.curveItemRepo.find({
      where: { curveId: sizeCurveId, tenantId },
    });
    const total = items.reduce((sum, i) => sum + i.quantity, 0);
    if (total !== unitsPerBox) {
      throw new BadRequestException(
        `La curva "${curve.name}" reparte ${total} unidades, pero la caja declara ${unitsPerBox}. ` +
          'Ajusta la curva o las unidades por caja.',
      );
    }
  }

  /** Siguiente correlativo libre de la orden (nunca el conteo: deja huecos). */
  private async nextConsecutive(
    purchaseOrderId: string,
    tenantId: string,
  ): Promise<number> {
    const row = await this.boxRepo
      .createQueryBuilder('b')
      .select('MAX(b.consecutive)', 'max')
      .where('b.purchaseOrderId = :purchaseOrderId', { purchaseOrderId })
      .andWhere('b.tenantId = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    return Number(row?.max ?? 0) + 1;
  }

  async addLine(
    orderId: string,
    dto: CreateBoxLineDto,
    tenantId: string,
  ): Promise<PurchaseBoxLine> {
    await this.getOrder(orderId, tenantId);

    const product = await this.productRepo.findOne({
      where: { id: dto.productId, tenantId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (dto.colorId) {
      const color = await this.colorRepo.findOne({
        where: { id: dto.colorId, tenantId },
      });
      if (!color) throw new NotFoundException('Color no encontrado');
    }
    if (dto.sizeCurveId) {
      await this.assertCurveMatchesBox(
        dto.sizeCurveId,
        dto.unitsPerBox,
        tenantId,
      );
    }

    return retryOnUniqueViolation(async () => {
      const line = this.boxRepo.create({
        purchaseOrderId: orderId,
        productId: dto.productId,
        colorId: dto.colorId ?? null,
        sizeCurveId: dto.sizeCurveId ?? null,
        boxes: dto.boxes,
        unitsPerBox: dto.unitsPerBox,
        unitCost: dto.unitCost,
        salePrice: dto.salePrice ?? null,
        comment: dto.comment ?? null,
        consecutive: await this.nextConsecutive(orderId, tenantId),
        tenantId,
      });
      return this.boxRepo.save(line);
    });
  }

  async updateLine(
    lineId: string,
    dto: UpdateBoxLineDto,
    tenantId: string,
  ): Promise<PurchaseBoxLine> {
    const line = await this.boxRepo.findOne({
      where: { id: lineId, tenantId },
    });
    if (!line) throw new NotFoundException('Renglón no encontrado');

    if (line.boxesReceived > 0) {
      throw new BadRequestException(
        'No se puede modificar un renglón que ya fue recibido en inventario.',
      );
    }

    const unitsPerBox = dto.unitsPerBox ?? line.unitsPerBox;
    const curveId =
      dto.sizeCurveId !== undefined ? dto.sizeCurveId : line.sizeCurveId;
    if (curveId) {
      await this.assertCurveMatchesBox(curveId, unitsPerBox, tenantId);
    }

    Object.assign(line, {
      ...(dto.boxes !== undefined && { boxes: dto.boxes }),
      ...(dto.unitsPerBox !== undefined && { unitsPerBox: dto.unitsPerBox }),
      ...(dto.unitCost !== undefined && { unitCost: dto.unitCost }),
      ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
      ...(dto.comment !== undefined && { comment: dto.comment }),
      ...(dto.sizeCurveId !== undefined && { sizeCurveId: dto.sizeCurveId }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return this.boxRepo.save(line);
  }

  async removeLine(
    lineId: string,
    tenantId: string,
  ): Promise<{ success: true }> {
    const line = await this.boxRepo.findOne({
      where: { id: lineId, tenantId },
    });
    if (!line) throw new NotFoundException('Renglón no encontrado');
    if (line.boxesReceived > 0) {
      throw new BadRequestException(
        'No se puede eliminar un renglón que ya fue recibido en inventario. Desactívalo.',
      );
    }
    await this.boxRepo.delete({ id: lineId, tenantId });
    return { success: true };
  }

  async findLines(
    orderId: string,
    tenantId: string,
  ): Promise<PurchaseBoxLine[]> {
    await this.getOrder(orderId, tenantId);
    return this.boxRepo.find({
      where: { purchaseOrderId: orderId, tenantId },
      order: { consecutive: 'ASC' },
    });
  }

  async updateImportCosts(
    orderId: string,
    dto: UpdateImportCostsDto,
    tenantId: string,
  ): Promise<PurchaseOrder> {
    const order = await this.getOrder(orderId, tenantId);
    if (dto.exchangeRate !== undefined) order.exchangeRate = dto.exchangeRate;
    if (dto.freightCosts !== undefined) order.freightCosts = dto.freightCosts;
    if (dto.freightAllocation !== undefined)
      order.freightAllocation = dto.freightAllocation;
    if (dto.arrivalDate !== undefined) {
      order.arrivalDate = dto.arrivalDate ? new Date(dto.arrivalDate) : null;
    }
    return this.orderRepo.save(order);
  }

  /**
   * Costeo de la orden completa: reparte los fletes entre **todas** las líneas,
   * tanto las de caja como las clásicas por variante, porque el flete se pagó
   * por el embarque entero.
   */
  async getLandedCost(
    orderId: string,
    tenantId: string,
  ): Promise<LandedCostResult> {
    const order = await this.getOrder(orderId, tenantId);

    const [boxLines, items] = await Promise.all([
      this.boxRepo.find({
        where: { purchaseOrderId: orderId, tenantId, isActive: true },
        order: { consecutive: 'ASC' },
      }),
      this.itemRepo.find({ where: { purchaseOrderId: orderId } }),
    ]);

    return calculateLandedCost(
      [
        ...boxLines.map((l) => ({
          id: l.id,
          units: l.boxes * l.unitsPerBox,
          unitCost: Number(l.unitCost),
        })),
        ...items.map((i) => ({
          id: i.id,
          units: i.quantityOrdered,
          unitCost: Number(i.unitCost),
        })),
      ],
      {
        exchangeRate: Number(order.exchangeRate),
        freightCosts: order.freightCosts ?? [],
        allocation: order.freightAllocation,
      },
    );
  }
}
