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
import { PurchaseBoxLine } from '../../purchases/entities/purchase-box-line.entity.js';

export interface ScanResult {
  /** `UNIT` = bulto etiquetado; `VARIANT` = producto suelto de siempre. */
  source: 'STOCK_UNIT' | 'VARIANT';
  variantId: string | null;
  productId: string;
  sku: string;
  categoryId: string | null;
  taxRate: number;
  imageUrl: string | null;
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
  /** Precio mínimo por unidad; null = sin restricción. */
  minimumSalePrice: number | null;
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
    @InjectRepository(PurchaseBoxLine)
    private readonly boxLineRepo: Repository<PurchaseBoxLine>,
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
      const purchaseLine = unit.purchaseBoxLineId
        ? await this.boxLineRepo.findOne({
            where: { id: unit.purchaseBoxLineId, tenantId },
          })
        : null;
      const basePrice = Number(
        purchaseLine?.salePrice ?? unit.product?.basePrice ?? 0,
      );
      return {
        source: 'STOCK_UNIT',
        variantId: unit.variantId ?? unit.variant?.id ?? null,
        productId: unit.productId,
        sku: unit.variant?.sku ?? unit.barcode,
        categoryId: unit.product?.categoryId ?? null,
        taxRate: Number(unit.product?.taxRate ?? 19),
        imageUrl: unit.product?.imageUrl ?? null,
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
        minimumSalePrice: unit.product?.minimumSalePrice
          ? Number(unit.product.minimumSalePrice)
          : null,
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
    // Las cajas cerradas pueden apuntar internamente a una variante
    // representativa, pero sus pares son de tallas mixtas. Nunca deben
    // aparecer como disponibilidad de esa talla al escanear el SKU; la caja
    // se vende únicamente escaneando su propio código físico.
    const boxes = await this.unitRepo.find({
      where: {
        variantId: variant.id,
        tenantId,
        kind: StockUnitKind.BOX,
        status: StockUnitStatus.IN_STOCK,
      },
    });
    const boxedByWarehouse = new Map<string, number>();
    for (const box of boxes) {
      boxedByWarehouse.set(
        box.warehouseId,
        (boxedByWarehouse.get(box.warehouseId) ?? 0) + Number(box.quantity),
      );
    }
    const looseStocks = stocks.map((stock) => ({
      ...stock,
      quantity: Math.max(
        0,
        Number(stock.quantity) - (boxedByWarehouse.get(stock.warehouseId) ?? 0),
      ),
    }));
    const available = looseStocks.reduce((sum, s) => sum + s.quantity, 0);

    return {
      source: 'VARIANT',
      variantId: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      categoryId: variant.product?.categoryId ?? null,
      taxRate: Number(variant.product?.taxRate ?? 19),
      imageUrl: variant.product?.imageUrl ?? null,
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
      warehouseId: looseStocks.find((stock) => stock.quantity > 0)?.warehouseId ?? stocks[0]?.warehouseId ?? null,
      minimumSalePrice: variant.product?.minimumSalePrice
        ? Number(variant.product.minimumSalePrice)
        : null,
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
