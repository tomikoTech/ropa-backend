import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  dondeEstaElBulto,
  noExisteEseCodigo,
  type RastroDelBulto,
} from '../donde-esta-el-bulto.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from '../../inventory/entities/stock-unit.entity.js';
import { Stock } from '../../inventory/entities/stock.entity.js';
import { PurchaseBoxLine } from '../../purchases/entities/purchase-box-line.entity.js';
import { StockUnitContent } from '../../inventory/entities/stock-unit-content.entity.js';

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
  /**
   * El código de barras: el identificador que la gente ve, fotografía y dicta
   * por teléfono. El uuid es del sistema; este es el del mundo real.
   *
   * En un bulto es el código de la caja o del par etiquetado —cada uno tiene
   * el suyo—; en un producto suelto es el de la variante.
   */
  barcode: string | null;
  /**
   * El código de la variante, cuando el escaneado fue el de un bulto.
   *
   * Los dos sirven y para cosas distintas: el del bulto encuentra **esa** caja
   * y el de la variante dice qué modelo y qué talla es. En pantalla se
   * muestran los dos porque el cajero pregunta las dos cosas.
   */
  variantBarcode: string | null;
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
  /**
   * El precio sugerido **no cubre el costo** de ese bulto.
   *
   * Es un sí o un no, no la cifra: quien cobra no tiene por qué ver el costo
   * (el servidor se lo quita), pero sí tiene que enterarse de que está a punto
   * de vender a pérdida. De aquí salió el caso real: una tienda tenía el costo
   * escrito en el campo de precio mayorista, y como la caja se cobra al por
   * mayor, el POS le proponía el costo en cada venta y había que corregirlo a
   * mano una por una.
   */
  belowCost?: boolean;
  /**
   * El precio de lista del producto, por unidad.
   *
   * Viaja aparte del sugerido para que el punto de venta pueda **volver** al
   * precio normal cuando el sugerido salió del mayorista: una caja se cobra al
   * por mayor por defecto, pero a veces no se quiere, y sin este dato la única
   * salida era teclear el precio a mano.
   */
  listPrice?: number | null;
  /**
   * Qué trae la caja: talla y cuántos pares de cada una. Vacío en los pares
   * sueltos y en los productos de siempre.
   */
  contents: { size: string; quantity: number }[];
  /**
   * De dónde salió el precio por par. La caja completa se cobra al por mayor
   * cuando el producto tiene ese precio: vender veinticuatro pares de una vez
   * no es una venta de mostrador.
   */
  priceSource: 'WHOLESALE' | 'PURCHASE' | 'BASE';
  /**
   * El precio al por mayor del producto, tenga o no que aplicarse ahora.
   *
   * Viaja siempre porque el mayoreo por volumen se decide en el carrito, con
   * todos los renglones a la vista: un par suelto no sabe todavía si va a ser
   * el número doce de su referencia. Nulo si el producto no tiene.
   */
  wholesalePrice: number | null;
  /** Precio de un par. El total de la línea es este por la cantidad. */
  unitPrice: number;
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
    @InjectRepository(StockUnitContent)
    private readonly contentRepo: Repository<StockUnitContent>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Dónde está este código, exista o no como disponible.
   *
   * Es la respuesta a «lo busco y no sale». La misma que usa el escaneo cuando
   * tiene que negarse, para que el mostrador no se quede con la caja en la
   * mano y sin explicación.
   */
  async rastroDelCodigo(
    barcode: string,
    tenantId: string,
  ): Promise<{
    encontrado: boolean;
    disponible: boolean;
    mensaje: string;
    rastro: RastroDelBulto | null;
  }> {
    const code = (barcode || '').trim();
    const unit = await this.unitRepo.findOne({
      where: { barcode: code, tenantId },
      relations: { warehouse: true },
    });
    if (!unit) {
      return {
        encontrado: false,
        disponible: false,
        mensaje: noExisteEseCodigo(code),
        rastro: null,
      };
    }
    const rastro = await this.rastroDeLaUnidad(unit, tenantId);
    return {
      encontrado: true,
      disponible: unit.status === StockUnitStatus.IN_STOCK,
      mensaje: dondeEstaElBulto(rastro),
      rastro,
    };
  }

  /** El rastro de un bulto ya leído, con la factura que lo reclama si la hay. */
  private async rastroDeLaUnidad(
    unit: StockUnit,
    tenantId: string,
  ): Promise<RastroDelBulto> {
    const base: RastroDelBulto = {
      codigo: unit.barcode,
      esCaja: unit.kind === StockUnitKind.BOX,
      estado: unit.status,
      bodega: unit.warehouse?.name ?? null,
      venta: null,
    };
    if (unit.status !== StockUnitStatus.SOLD) return base;

    // Dos caminos, y hacen falta los dos: la línea de la venta anotó el bulto
    // cuando el cajero lo escaneó, y el ledger deja el evento cuando los pares
    // los eligió la cascada. Sin el segundo, media tienda queda «vendida sin
    // factura».
    const filas: {
      sale_number: string;
      created_at: Date;
      status: string;
      first_name: string | null;
      last_name: string | null;
    }[] = await this.dataSource.query(
      `SELECT s.sale_number, s.created_at, s.status, c.first_name, c.last_name
         FROM sales s
         LEFT JOIN clients c ON c.id = s.client_id
        WHERE s.tenant_id = $2
          AND (
            s.id IN (SELECT si.sale_id FROM sale_items si WHERE si.stock_unit_id = $1)
            OR s.id IN (
              SELECT e.reference_id FROM stock_unit_events e
               WHERE e.stock_unit_id = $1
                 AND e.to_status = 'SOLD'
                 AND e.reference_type = 'SALE'
            )
          )
        ORDER BY s.created_at DESC
        LIMIT 1`,
      [unit.id, tenantId],
    );
    const fila = filas[0];
    if (!fila) return base;

    return {
      ...base,
      venta: {
        numero: fila.sale_number,
        fecha: this.diaLegible(fila.created_at),
        cliente:
          [fila.first_name, fila.last_name].filter(Boolean).join(' ').trim() ||
          null,
        anulada: fila.status === 'CANCELLED',
      },
    };
  }

  /** «8 de septiembre», en la hora de la tienda y no en la del servidor. */
  private diaLegible(fecha: Date): string {
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Bogota',
    }).format(new Date(fecha));
  }

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
        // Con la factura que lo tiene, no solo el estado: «ya fue vendida»
        // deja al cajero con la caja en la mano y sin salida.
        throw new NotFoundException(
          dondeEstaElBulto(await this.rastroDeLaUnidad(unit, tenantId)),
        );
      }
      const purchaseLine = unit.purchaseBoxLineId
        ? await this.boxLineRepo.findOne({
            where: { id: unit.purchaseBoxLineId, tenantId },
          })
        : null;
      // El precio de un par, y de dónde sale. Una caja cerrada se vende
      // completa —doce, veinticuatro pares de un golpe—, así que si el
      // producto tiene precio al por mayor es ese el que manda: cobrarla a
      // precio de mostrador obligaba a corregir cada venta a mano.
      const mayorista = Number(unit.product?.wholesalePrice ?? 0);
      const deLaCompra = Number(purchaseLine?.salePrice ?? 0);
      const deLista = Number(unit.product?.basePrice ?? 0);
      const esCaja = unit.kind === StockUnitKind.BOX;
      const priceSource: ScanResult['priceSource'] =
        esCaja && mayorista > 0
          ? 'WHOLESALE'
          : deLaCompra > 0
            ? 'PURCHASE'
            : 'BASE';
      const basePrice =
        priceSource === 'WHOLESALE'
          ? mayorista
          : priceSource === 'PURCHASE'
            ? deLaCompra
            : deLista;

      // Lo que hay adentro. Se lee del contenido detallado de esa caja y no de
      // la curva del renglón: la curva puede cambiar después, y lo que se
      // entrega es lo que la caja trae.
      const contents = esCaja
        ? (
            await this.contentRepo.find({
              where: { boxUnitId: unit.id, tenantId },
              relations: { size: true },
            })
          )
            .filter((row) => Number(row.actualQuantity) > 0)
            .map((row) => ({
              size: row.size?.name ?? '',
              quantity: Number(row.actualQuantity),
            }))
            .sort((a, b) =>
              a.size.localeCompare(b.size, 'es', { numeric: true }),
            )
        : [];

      return {
        source: 'STOCK_UNIT',
        variantId: unit.variantId ?? unit.variant?.id ?? null,
        productId: unit.productId,
        sku: unit.variant?.sku ?? unit.barcode,
        // El del bulto, no el de la variante: es el que está pegado en esa
        // caja concreta y el que se vuelve a escanear para encontrarla.
        barcode: unit.barcode,
        variantBarcode: unit.variant?.barcode ?? null,
        categoryId: unit.product?.categoryId ?? null,
        taxRate: Number(unit.product?.taxRate ?? 19),
        imageUrl: unit.product?.imageUrl ?? null,
        productName: unit.product?.name ?? 'Producto',
        size: unit.size?.name ?? '',
        color: unit.color?.name ?? '',
        quantity: unit.quantity,
        // La caja se cobra por su contenido; el par, por su precio.
        suggestedPrice: basePrice * unit.quantity,
        unitPrice: basePrice,
        priceSource,
        // Costo cero es «sin costo registrado», no «costó cero»: sin costo no
        // hay nada que comparar y no se avisa.
        belowCost:
          Number(unit.cost) > 0 && basePrice > 0 && basePrice <= Number(unit.cost),
        listPrice: deLista > 0 ? deLista : null,
        wholesalePrice: mayorista > 0 ? mayorista : null,
        contents,
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
      throw new NotFoundException(noExisteEseCodigo(code));
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
      // También acá: un par suelto no sabe todavía si va a ser el doceavo de
      // su referencia en el carrito.
      wholesalePrice: Number(variant.product?.wholesalePrice ?? 0) || null,
      variantId: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      barcode: variant.barcode ?? null,
      // Un producto suelto no tiene bulto: el de la variante es el único que
      // hay, y va en los dos campos para que quien lo pinte no tenga que
      // preguntar de dónde vino.
      variantBarcode: variant.barcode ?? null,
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
      warehouseId:
        looseStocks.find((stock) => stock.quantity > 0)?.warehouseId ??
        stocks[0]?.warehouseId ??
        null,
      minimumSalePrice: variant.product?.minimumSalePrice
        ? Number(variant.product.minimumSalePrice)
        : null,
      contents: [],
      priceSource: 'BASE',
      unitPrice: Number(
        variant.priceOverride ?? variant.product?.basePrice ?? 0,
      ),
    };
  }

}
