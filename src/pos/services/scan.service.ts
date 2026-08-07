import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from '../../inventory/entities/stock-unit.entity.js';
import { Stock } from '../../inventory/entities/stock.entity.js';

export interface ScanResult {
  /** `UNIT` = bulto etiquetado; `VARIANT` = producto suelto de siempre. */
  source: 'STOCK_UNIT' | 'VARIANT';
  variantId: string | null;
  productName: string;
  size: string;
  color: string;
  /**
   * Cuántas unidades entran a la venta con un solo escaneo.
   * Una caja arrastra todo su contenido: es lo que la hace vendible como bulto.
   */
  quantity: number;
  /** Precio sugerido para la línea completa. */
  suggestedPrice: number;
  /** Solo en bultos: lo que hay que marcar como vendido al cerrar la venta. */
  stockUnitId: string | null;
  kind: 'BOX' | 'UNIT' | null;
  /** Existencias disponibles (para productos sueltos). */
  available: number | null;
  warehouseId: string | null;
}

/**
 * Resuelve un código escaneado en el punto de venta.
 *
 * El cajero escanea y el sistema decide: si el código es de un **bulto**
 * (caja o par etiquetado) se vende ese bulto; si es de una **variante**, se
 * comporta como siempre. Así el POS soporta los dos mundos sin que el cajero
 * tenga que saber en cuál está.
 */
@Injectable()
export class ScanService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(StockUnit)
    private readonly unitRepo: Repository<StockUnit>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
  ) {}

  async resolve(barcode: string, tenantId: string): Promise<ScanResult> {
    const code = (barcode || '').trim();

    // Primero los bultos: son los códigos que imprime el propio sistema, y
    // llevan más información (cuántas unidades trae y a qué costo entró).
    const unit = await this.unitRepo.findOne({
      where: { barcode: code, tenantId },
      relations: { product: true, color: true, size: true, variant: true },
    });

    if (unit) {
      if (unit.status !== StockUnitStatus.IN_STOCK) {
        throw new NotFoundException(
          this.explainUnavailable(unit.status, unit.kind),
        );
      }
      const basePrice = Number(unit.product?.basePrice ?? 0);
      return {
        source: 'STOCK_UNIT',
        variantId: unit.variantId ?? unit.variant?.id ?? null,
        productName: unit.product?.name ?? 'Producto',
        size: unit.size?.name ?? '',
        color: unit.color?.name ?? '',
        quantity: unit.quantity,
        // La caja se cobra por su contenido; el par, por su precio.
        suggestedPrice: basePrice * unit.quantity,
        stockUnitId: unit.id,
        kind: unit.kind,
        available: null,
        warehouseId: unit.warehouseId,
      };
    }

    const variant = await this.variantRepo.findOne({
      where: { barcode: code, tenantId },
      relations: { product: true },
    });
    if (!variant) {
      throw new NotFoundException(
        `No se encontró ningún producto con el código ${code}`,
      );
    }

    const stocks = await this.stockRepo.find({
      where: { variantId: variant.id, tenantId },
    });
    const available = stocks.reduce((sum, s) => sum + s.quantity, 0);

    return {
      source: 'VARIANT',
      variantId: variant.id,
      productName: variant.product?.name ?? 'Producto',
      size: variant.sizeName,
      color: variant.colorName,
      quantity: 1,
      suggestedPrice: Number(
        variant.priceOverride ?? variant.product?.basePrice ?? 0,
      ),
      stockUnitId: null,
      kind: null,
      available,
      warehouseId: stocks[0]?.warehouseId ?? null,
    };
  }

  /** Mensajes concretos: el cajero necesita saber por qué no puede venderlo. */
  private explainUnavailable(
    status: StockUnitStatus,
    kind: StockUnitKind,
  ): string {
    const what = kind === StockUnitKind.BOX ? 'La caja' : 'La unidad';
    switch (status) {
      case StockUnitStatus.SOLD:
        return `${what} ya fue vendida.`;
      case StockUnitStatus.SPLIT:
        return 'Esta caja ya se abrió: escanea las unidades que salieron de ella.';
      case StockUnitStatus.CONSIGNED:
        return `${what} está entregada en consignación.`;
      case StockUnitStatus.TRANSFERRED:
        return `${what} fue trasladada a otra bodega.`;
      case StockUnitStatus.WRITTEN_OFF:
        return `${what} fue dada de baja.`;
      default:
        return `${what} no está disponible para la venta.`;
    }
  }
}
