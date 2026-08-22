import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  In,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
} from 'typeorm';
import { Warehouse } from './entities/warehouse.entity.js';
import { Stock } from './entities/stock.entity.js';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from './entities/stock-unit.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { StockTransfer } from './entities/stock-transfer.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { TransferStockDto } from './dto/transfer-stock.dto.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  desdeInicioDelDia,
  hastaFinDelDia,
  movementDelta,
} from './movement-delta.js';
import { RecipeService } from '../products/services/recipe.service.js';
import { StockLedgerService } from './ledger/stock-ledger.service.js';
import { CajaService } from '../caja/caja.service.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';

/** Una remisión con todo lo que hace falta para entenderla sin preguntar. */
export interface TrasladoConContexto {
  id: string;
  transferNumber: string | null;
  type: string;
  status: string;
  quantity: number;
  returnedQuantity: number;
  pendingReturn: number;
  notes: string | null;
  reason: string | null;
  createdAt: Date;
  receivedAt: Date | null;
  closedAt: Date | null;
  createdByName: string | null;
  receivedByName: string | null;
  closedByName: string | null;
  variantId: string;
  productId: string | null;
  productName: string | null;
  productCode: string | null;
  variantSku: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
  fromWarehouseId: string;
  fromWarehouseName: string | null;
  toWarehouseId: string;
  toWarehouseName: string | null;
  returnOfTransferId: string | null;
  returns: {
    id: string;
    transferNumber: string | null;
    quantity: number;
    status: string;
    createdAt: Date;
  }[];
}

/**
 * Los estados de una remisión, dichos como los diría la tienda.
 *
 * Los mensajes de error decían «La remisión ya está en estado CANCELLED».
 */
const DESCRIPCION_DE_TRASLADO: Record<string, string> = {
  PENDING: 'en tránsito',
  RECEIVED: 'recibida',
  RETURNED: 'devuelta',
  CANCELLED: 'cancelada',
  REJECTED: 'rechazada por el destino',
};

/** Un movimiento con todo lo que la pantalla necesita para explicarlo. */
export interface MovimientoConContexto {
  id: string;
  date: Date;
  movementType: MovementType;
  quantity: number;
  productId: string | null;
  productName: string;
  variantSku: string;
  /**
   * La referencia impresa en la caja y el código que lee el escáner.
   *
   * «El zapato trae un código; siempre que se haga un movimiento, mostrar el
   * nombre pero también el código». Con solo el nombre y la talla no se puede
   * ir a la bodega a buscar la caja ni confirmar por teléfono que se está
   * hablando del mismo par.
   */
  productCode: string | null;
  barcode: string | null;
  /**
   * Los códigos de los pares concretos que se movieron.
   *
   * `barcode` es el de la variante: identifica el modelo, la talla y el color,
   * y es **el mismo** para todos los pares iguales. Estos son los que van
   * impresos en cada caja, y son los que sirven para ir a buscarla.
   */
  unitBarcodes: string[] | null;
  variantLabel: string;
  warehouseName: string;
  referenceType: string | null;
  referenceId: string | null;
  /** Número de factura o de orden, en vez del id interno. */
  referenceLabel: string | null;
  /** El cliente que se llevó la mercancía o el proveedor que la trajo. */
  counterparty: string | null;
  notes: string | null;
  userName: string | null;
  userEmail: string | null;
}

/**
 * Un instante de la petición, o `undefined` si no vino o no se entiende.
 *
 * La pantalla manda ISO con huso porque es la única que sabe dónde está la
 * tienda; el servidor corre en UTC.
 */
function parseInstante(valor?: string): Date | undefined {
  if (!valor?.trim()) return undefined;
  const fecha = new Date(valor.trim());
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(StockUnit)
    private readonly stockUnitRepository: Repository<StockUnit>,
    @InjectRepository(StockMovement)
    private readonly movementRepository: Repository<StockMovement>,
    @InjectRepository(StockTransfer)
    private readonly transferRepository: Repository<StockTransfer>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepository: Repository<StoreSettings>,
    private readonly recipeService: RecipeService,
    private readonly dataSource: DataSource,
    // El único camino por el que se mueve inventario: mantiene el agregado y
    // los bultos cuadrados en la misma transacción.
    private readonly ledger: StockLedgerService,
    private readonly caja: CajaService,
  ) {}

  // ─── Warehouses ───

  async createWarehouse(
    dto: CreateWarehouseDto,
    tenantId: string,
  ): Promise<Warehouse> {
    const nameTaken = await this.warehouseRepository.findOne({
      where: { name: dto.name, tenantId },
    });
    if (nameTaken) {
      throw new ConflictException('Ya existe una bodega con ese nombre');
    }

    if (dto.code) {
      const codeTaken = await this.warehouseRepository.findOne({
        where: { code: dto.code, tenantId },
      });
      if (codeTaken) {
        throw new ConflictException('Ya existe una bodega con ese código');
      }
    }

    // Con el código autogenerado, el retry recalcula el consecutivo: basarlo en
    // el conteo hacía que, tras borrar una bodega, el siguiente código chocara
    // con uno existente y ninguna bodega nueva se pudiera crear.
    return retryOnUniqueViolation(async () => {
      const code = dto.code || (await this.nextWarehouseCode(tenantId));
      const warehouse = this.warehouseRepository.create({
        ...dto,
        code,
        tenantId,
      });
      return this.warehouseRepository.save(warehouse);
    });
  }

  private async nextWarehouseCode(tenantId: string): Promise<string> {
    const rows = await this.warehouseRepository
      .createQueryBuilder('w')
      .select('w.code', 'code')
      .where('w.tenantId = :tenantId', { tenantId })
      .andWhere("w.code LIKE 'BOD-%'")
      .getRawMany<{ code: string }>();
    const taken = new Set(rows.map((r) => r.code));
    let n = 1;
    while (taken.has(`BOD-${String(n).padStart(3, '0')}`)) n++;
    return `BOD-${String(n).padStart(3, '0')}`;
  }

  async findAllWarehouses(tenantId: string): Promise<Warehouse[]> {
    return this.warehouseRepository.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async findWarehouse(id: string, tenantId: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id, tenantId },
    });
    if (!warehouse) throw new NotFoundException('Bodega no encontrada');
    return warehouse;
  }

  async updateWarehouse(
    id: string,
    dto: UpdateWarehouseDto,
    tenantId: string,
  ): Promise<Warehouse> {
    const warehouse = await this.findWarehouse(id, tenantId);

    if (dto.name !== undefined) warehouse.name = dto.name;
    if (dto.code !== undefined) warehouse.code = dto.code;
    if (dto.address !== undefined) warehouse.address = dto.address;
    if (dto.isPosLocation !== undefined)
      warehouse.isPosLocation = dto.isPosLocation;
    if (dto.isActive !== undefined) warehouse.isActive = dto.isActive;

    return this.warehouseRepository.save(warehouse);
  }

  async removeWarehouse(id: string, tenantId: string): Promise<void> {
    const warehouse = await this.findWarehouse(id, tenantId);
    await this.warehouseRepository.remove(warehouse);
  }

  // ─── Stock ───

  /** Añade al inventario la separación visible entre pares sueltos y cajas. */
  private async withBoxBreakdown(rows: Stock[], tenantId: string) {
    if (rows.length === 0) return rows;
    const boxes = await this.stockUnitRepository.find({
      where: {
        tenantId,
        kind: StockUnitKind.BOX,
        status: StockUnitStatus.IN_STOCK,
      },
    });
    const boxedByKey = new Map<string, number>();
    for (const box of boxes) {
      const key = `${box.variantId}|${box.warehouseId}`;
      boxedByKey.set(key, (boxedByKey.get(key) ?? 0) + Number(box.quantity));
    }
    return rows.map((row) => {
      const boxedQuantity =
        boxedByKey.get(`${row.variantId}|${row.warehouseId}`) ?? 0;
      return Object.assign(row, {
        boxedQuantity,
        looseQuantity: Math.max(0, Number(row.quantity) - boxedQuantity),
      });
    });
  }

  async getStockByWarehouse(
    warehouseId: string,
    tenantId: string,
  ): Promise<Stock[]> {
    const rows = await this.stockRepository.find({
      where: { warehouseId, tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
      order: { variant: { product: { name: 'ASC' } } },
    });
    return this.withBoxBreakdown(rows, tenantId);
  }

  async getStockByVariant(
    variantId: string,
    tenantId: string,
  ): Promise<Stock[]> {
    const rows = await this.stockRepository.find({
      where: { variantId, tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
    });
    return this.withBoxBreakdown(rows, tenantId);
  }

  async getAllStock(tenantId: string): Promise<Stock[]> {
    const rows = await this.stockRepository.find({
      where: { tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
      order: { warehouse: { name: 'ASC' } },
    });
    return this.withBoxBreakdown(rows, tenantId);
  }

  async getLowStock(tenantId: string): Promise<Stock[]> {
    const all = await this.stockRepository.find({
      where: { tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
      order: { quantity: 'ASC' },
    });
    return all.filter((s) => s.minStock > 0 && s.quantity <= s.minStock);
  }

  /**
   * "Puntas": referencias a las que solo les quedan pocas tallas con stock
   * (para jornadas de promoción). Un producto es punta si tiene stock en
   * `<= maxSizes` tallas distintas, pero llegó a tener más tallas (definidas).
   * Usa las filas de stock (las variantes agotadas quedan en 0, así se conoce
   * la curva original). Devuelve, por producto, las tallas que quedan y totales.
   */
  async getLeftovers(
    tenantId: string,
    maxSizes = 2,
  ): Promise<
    {
      productId: string;
      productName: string;
      brand: string | null;
      inStockSizes: number;
      definedSizes: number;
      totalQty: number;
      remaining: { size: string; qty: number }[];
      isLeftover: boolean | null;
    }[]
  > {
    const rows = await this.stockRepository.find({
      where: { tenantId },
      relations: ['variant', 'variant.product'],
    });
    type Agg = {
      productId: string;
      productName: string;
      brand: string | null;
      isLeftover: boolean | null;
      definedSizes: Set<string>;
      remaining: Map<string, number>;
    };
    const byProduct = new Map<string, Agg>();
    for (const s of rows) {
      const p = s.variant?.product;
      if (!p) continue;
      const size = s.variant.sizeName || '(única)';
      let agg = byProduct.get(p.id);
      if (!agg) {
        agg = {
          productId: p.id,
          productName: p.name,
          brand: p.brand ?? null,
          isLeftover: p.isLeftover ?? null,
          definedSizes: new Set(),
          remaining: new Map(),
        };
        byProduct.set(p.id, agg);
      }
      agg.definedSizes.add(size);
      if (s.quantity > 0) {
        agg.remaining.set(size, (agg.remaining.get(size) || 0) + s.quantity);
      }
    }

    const result: {
      productId: string;
      productName: string;
      brand: string | null;
      inStockSizes: number;
      definedSizes: number;
      totalQty: number;
      remaining: { size: string; qty: number }[];
      isLeftover: boolean | null;
    }[] = [];
    for (const agg of byProduct.values()) {
      const inStockSizes = agg.remaining.size;
      if (inStockSizes < 1 || inStockSizes > maxSizes) continue;
      if (agg.definedSizes.size <= inStockSizes) continue; // nunca tuvo más tallas
      const remaining = [...agg.remaining.entries()]
        .map(([size, qty]) => ({ size, qty }))
        .sort((a, b) => a.size.localeCompare(b.size));
      result.push({
        productId: agg.productId,
        productName: agg.productName,
        brand: agg.brand,
        inStockSizes,
        definedSizes: agg.definedSizes.size,
        totalQty: remaining.reduce((sum, r) => sum + r.qty, 0),
        remaining,
        isLeftover: agg.isLeftover,
      });
    }
    return result.sort((a, b) => a.totalQty - b.totalQty);
  }

  /**
   * Resumen por LOTE/PEDIDO: cuántos productos, cuántas unidades quedan en
   * stock y su valor, agrupado por la etiqueta `lote` del producto.
   * Responde "¿cuánto queda del pedido de X?".
   */
  async getLotes(tenantId: string): Promise<
    {
      lote: string;
      productCount: number;
      unitsInStock: number;
      stockValue: number;
    }[]
  > {
    const rows = await this.stockRepository.find({
      where: { tenantId },
      relations: ['variant', 'variant.product'],
    });
    const byLote = new Map<
      string,
      { lote: string; productIds: Set<string>; units: number; value: number }
    >();
    for (const s of rows) {
      const p = s.variant?.product;
      if (!p || !p.lote) continue;
      let agg = byLote.get(p.lote);
      if (!agg) {
        agg = { lote: p.lote, productIds: new Set(), units: 0, value: 0 };
        byLote.set(p.lote, agg);
      }
      agg.productIds.add(p.id);
      agg.units += s.quantity;
      agg.value += s.quantity * Number(p.basePrice);
    }
    return [...byLote.values()]
      .map((e) => ({
        lote: e.lote,
        productCount: e.productIds.size,
        unitsInStock: e.units,
        stockValue: e.value,
      }))
      .sort((a, b) => b.unitsInStock - a.unitsInStock);
  }

  private async getOrCreateStock(
    variantId: string,
    warehouseId: string,
    tenantId: string,
  ): Promise<Stock> {
    let stock = await this.stockRepository.findOne({
      where: { variantId, warehouseId, tenantId },
    });
    if (!stock) {
      stock = this.stockRepository.create({
        variantId,
        warehouseId,
        tenantId,
        quantity: 0,
        minStock: 0,
      });
      stock = await this.stockRepository.save(stock); // ledger-exento: la crea en cero
    }
    return stock;
  }

  // ─── Stock Adjustments ───

  async adjustStock(
    dto: AdjustStockDto,
    userId: string,
    tenantId: string,
  ): Promise<Stock> {
    return this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);

      const previo = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.warehouseId,
          tenantId,
        },
      });
      const prevQuantity = previo?.quantity ?? 0;

      // Por el ledger: un ajuste en una tienda con códigos por par también
      // tiene que crear o consumir bultos. Antes solo movía `stock.quantity`,
      // así que cargar inventario a mano dejaba existencia sin etiqueta —y una
      // salida dejaba etiquetas de pares que ya no estaban—.
      await this.ledger.mover(manager, {
        variantId: dto.variantId,
        warehouseId: dto.warehouseId,
        // `ADJUSTMENT` no dice cuánto se movió: dice en cuánto queda.
        ...(dto.movementType === MovementType.ADJUSTMENT
          ? { cantidad: 0, dejarEn: dto.quantity }
          : {
              cantidad:
                dto.movementType === MovementType.IN
                  ? dto.quantity
                  : -dto.quantity,
            }),
        motivo: 'ADJUSTMENT',
        notas: dto.notes ?? null,
        usuarioId: userId,
        tenantId,
      });

      const stock = await stockRepo.findOneOrFail({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.warehouseId,
          tenantId,
        },
      });

      // Perfumería: solo si se pide explícitamente (consumeEssence=producción)
      // y se AGREGARON unidades de un producto final con receta, se consume la
      // esencia proporcional (misma bodega). Por defecto NO se consume, para
      // que cargar inventario inicial/conteos/correcciones no toque esencias.
      // Cero efecto para productos sin receta.
      const unitsAdded = stock.quantity - prevQuantity;
      if (dto.consumeEssence && unitsAdded > 0) {
        const variant = await manager.getRepository(ProductVariant).findOne({
          where: { id: dto.variantId, tenantId },
        });
        if (variant) {
          await this.recipeService.consumeEssences(manager, {
            productId: variant.productId,
            units: unitsAdded,
            warehouseId: dto.warehouseId,
            userId,
            tenantId,
            referenceId: stock.id,
          });
        }
      }

      return stockRepo.findOne({
        where: { id: stock.id },
        relations: ['variant', 'variant.product', 'warehouse'],
      }) as Promise<Stock>;
    });
  }

  // ─── Transfers ───

  async transferStock(
    dto: TransferStockDto,
    userId: string,
    tenantId: string,
  ): Promise<
    { from: Stock; to: Stock; transfer: StockTransfer } | StockTransfer
  > {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'La bodega origen y destino deben ser diferentes',
      );
    }

    // Remisiones (F3): con confirmación de recepción el traslado NO es inmediato,
    // se descuenta del origen y queda en tránsito (PENDING) hasta que el destino
    // lo reciba.
    //
    // Lo decide la petición si lo dice (`requireConfirmation`) y, si no, el
    // ajuste de la tienda — que es el comportamiento de siempre. Dejar que solo
    // manda el ajuste global hacía que la misma petición hiciera dos cosas
    // distintas según una configuración que quien llama no ve.
    let requireConfirmation = dto.requireConfirmation;
    if (requireConfirmation === undefined) {
      const settings = await this.settingsRepository.findOne({
        where: { tenantId },
      });
      requireConfirmation = !!settings?.transferConfirmationEnabled;
    }
    if (requireConfirmation) {
      return this.createInTransitTransfer(dto, userId, tenantId);
    }

    return this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);
      const transferRepo = manager.getRepository(StockTransfer);

      // El traslado inmediato también queda registrado.
      //
      // Antes no dejaba fila en `stock_transfers`: la remisión solo existía si
      // la tienda tenía activada la confirmación de recepción. Para todas las
      // demás no había historial de traslados en absoluto —solo dos movimientos
      // sueltos cuyo `referenceId` era una **bodega**, así que ni siquiera se
      // podían emparejar la salida con su entrada—. Se registra ya recibido,
      // que es lo que de verdad pasó: salió y llegó en el mismo acto.
      const ahora = new Date();
      const transfer = await transferRepo.save(
        transferRepo.create({
          transferNumber: await this.siguienteNumeroDeTraslado(
            manager,
            tenantId,
          ),
          type: 'TRANSFER',
          status: 'RECEIVED',
          variantId: dto.variantId,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
          notes: dto.notes ?? null,
          createdById: userId,
          receivedById: userId,
          receivedAt: ahora,
          tenantId,
        }),
      );

      // El movimiento va por el ledger: mueve el agregado **y** los bultos en
      // la misma transacción, y un traslado conserva el código del par en vez
      // de consumirlo y recrearlo. Antes esto solo tocaba `stock.quantity`, así
      // que en una tienda con códigos por par los bultos se quedaban en la
      // bodega de origen mientras la existencia ya estaba en la otra.
      await this.ledger.trasladar(manager, {
        variantId: dto.variantId,
        desdeWarehouseId: dto.fromWarehouseId,
        hastaWarehouseId: dto.toWarehouseId,
        cantidad: dto.quantity,
        motivo: 'TRANSFER_OUT',
        referenciaId: transfer.id,
        notas: dto.notes ?? null,
        usuarioId: userId,
        tenantId,
      });

      const from = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.fromWarehouseId,
          tenantId,
        },
        relations: ['variant', 'variant.product', 'warehouse'],
      });
      const to = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.toWarehouseId,
          tenantId,
        },
        relations: ['variant', 'variant.product', 'warehouse'],
      });

      return { from: from!, to: to!, transfer };
    });
  }

  // Stock total por producto (suma de todas sus variantes/bodegas). Para mostrar
  // el stock en la lista de Productos sin traer todo el detalle.
  async getStockSummaryByProduct(
    tenantId: string,
  ): Promise<Record<string, number>> {
    const rows = await this.stockRepository
      .createQueryBuilder('s')
      .innerJoin('product_variants', 'pv', 'pv.id = s.variant_id')
      .select('pv.product_id', 'productId')
      .addSelect('SUM(s.quantity)', 'qty')
      .where('s.tenant_id = :t', { t: tenantId })
      .groupBy('pv.product_id')
      .getRawMany<{ productId: string; qty: string }>();
    const map: Record<string, number> = {};
    for (const r of rows) map[r.productId] = Number(r.qty);
    return map;
  }

  // ─── Remisiones (traslados con confirmación) y préstamos ───

  // F3: crea una remisión en tránsito. Descuenta del origen y deja PENDING;
  // el stock aparece en destino solo cuando se recibe.
  async createInTransitTransfer(
    dto: TransferStockDto,
    userId: string,
    tenantId: string,
  ): Promise<StockTransfer> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'La bodega origen y destino deben ser diferentes',
      );
    }
    const transferId = await this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);
      const transferRepo = manager.getRepository(StockTransfer);

      const fromStock = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.fromWarehouseId,
          tenantId,
        },
      });
      if (!fromStock || fromStock.quantity < dto.quantity) {
        throw new BadRequestException(
          `Stock insuficiente en bodega origen. Disponible: ${fromStock?.quantity ?? 0}`,
        );
      }
      const transfer = await transferRepo.save(
        transferRepo.create({
          transferNumber: await this.siguienteNumeroDeTraslado(
            manager,
            tenantId,
          ),
          type: 'TRANSFER',
          status: 'PENDING',
          variantId: dto.variantId,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
          notes: dto.notes ?? null,
          createdById: userId,
          tenantId,
        }),
      );

      // La mercancía sale del origen y queda en tránsito. Los bultos salen con
      // ella —quedan TRANSFERRED, fuera del disponible— y vuelven a entrar en
      // el destino cuando alguien recibe la remisión.
      await this.ledger.mover(manager, {
        variantId: dto.variantId,
        warehouseId: dto.fromWarehouseId,
        cantidad: -dto.quantity,
        motivo: 'TRANSFER_OUT',
        referenciaId: transfer.id,
        notas: dto.notes || 'Remisión en tránsito',
        usuarioId: userId,
        tenantId,
      });

      return transfer.id;
    });
    return this.findTransfer(transferId, tenantId);
  }

  // Recibe una remisión PENDING: suma al destino y la marca RECEIVED.
  async receiveTransfer(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<StockTransfer> {
    await this.dataSource.transaction(async (manager) => {
      const transferRepo = manager.getRepository(StockTransfer);

      const transfer = await transferRepo.findOne({
        where: { id, tenantId },
      });
      if (!transfer) throw new NotFoundException('Remisión no encontrada');
      if (transfer.type !== 'TRANSFER') {
        throw new BadRequestException('Esta remisión no es un traslado');
      }
      if (transfer.status !== 'PENDING') {
        throw new BadRequestException(
          `La remisión ya está en estado ${transfer.status}`,
        );
      }

      // Lo que estaba en tránsito entra al destino, bultos incluidos.
      await this.ledger.mover(manager, {
        variantId: transfer.variantId,
        warehouseId: transfer.toWarehouseId,
        cantidad: transfer.quantity,
        motivo: 'TRANSFER_IN',
        referenciaId: transfer.id,
        notas: 'Recepción de remisión',
        usuarioId: userId,
        tenantId,
      });

      transfer.status = 'RECEIVED';
      transfer.receivedById = userId;
      transfer.receivedAt = new Date();
      await transferRepo.save(transfer);
    });
    return this.findTransfer(id, tenantId);
  }

  /**
   * Cierra una remisión en tránsito devolviendo el stock al origen.
   *
   * Sirve a dos casos que mueven el inventario igual pero **no significan lo
   * mismo**: el origen se arrepintió (`CANCELLED`) o el destino no la aceptó
   * (`REJECTED`). Guardarlos bajo la misma palabra obligaba a preguntar por
   * WhatsApp qué había pasado con una remisión que nunca llegó.
   */
  private async closePendingTransfer(
    id: string,
    userId: string,
    tenantId: string,
    status: 'CANCELLED' | 'REJECTED',
    reason?: string,
  ): Promise<StockTransfer> {
    await this.dataSource.transaction(async (manager) => {
      const transferRepo = manager.getRepository(StockTransfer);

      const transfer = await transferRepo.findOne({ where: { id, tenantId } });
      if (!transfer) throw new NotFoundException('Remisión no encontrada');
      if (transfer.type !== 'TRANSFER') {
        throw new BadRequestException(
          'Solo se cancelan traslados; para préstamos usa Retornar',
        );
      }
      if (transfer.status !== 'PENDING') {
        throw new BadRequestException(
          `La remisión ya está en estado ${DESCRIPCION_DE_TRASLADO[transfer.status]}`,
        );
      }

      // Lo que estaba en tránsito vuelve al origen, bultos incluidos.
      const motivo = reason?.trim() || null;
      await this.ledger.mover(manager, {
        variantId: transfer.variantId,
        warehouseId: transfer.fromWarehouseId,
        cantidad: transfer.quantity,
        motivo: 'TRANSFER_IN',
        referenciaId: transfer.id,
        notas:
          motivo ??
          (status === 'REJECTED'
            ? 'El destino no aceptó la remisión (devuelto a origen)'
            : 'Cancelación de remisión (devuelto a origen)'),
        usuarioId: userId,
        tenantId,
      });

      transfer.status = status;
      transfer.reason = motivo;
      transfer.closedById = userId;
      transfer.closedAt = new Date();
      await transferRepo.save(transfer);
    });
    return this.findTransfer(id, tenantId);
  }

  // El origen se arrepiente: la remisión no sale.
  async cancelTransfer(
    id: string,
    userId: string,
    tenantId: string,
    reason?: string,
  ): Promise<StockTransfer> {
    return this.closePendingTransfer(id, userId, tenantId, 'CANCELLED', reason);
  }

  // El destino no acepta lo que le mandaron: vuelve al origen y queda escrito
  // por qué. Sin el motivo, la mercancía regresaba y nadie sabía si fue porque
  // llegó rota, incompleta o porque simplemente no era lo que pidieron.
  async rejectTransfer(
    id: string,
    userId: string,
    tenantId: string,
    reason?: string,
  ): Promise<StockTransfer> {
    return this.closePendingTransfer(id, userId, tenantId, 'REJECTED', reason);
  }

  /**
   * Devuelve al origen mercancía de un traslado **ya recibido**.
   *
   * El caso, tal cual lo contaron: «hicimos el traslado pero no se vendió el
   * zapato, entonces para hacer las devoluciones». Hasta ahora la única salida
   * era un traslado nuevo en sentido contrario, suelto: el inventario quedaba
   * bien pero nadie podía ver que esos pares eran los que habían ido.
   *
   * La devolución es una remisión propia —con su número, su responsable y su
   * fecha— apuntando a la original con `returnOfTransferId`. Se devuelve por
   * partes porque así ocurre: se mandaron seis, se vendieron cuatro, vuelven
   * dos.
   *
   * `requireConfirmation` decide si la vuelta viaja en tránsito (el origen
   * confirma que le llegó) o si se aplica de una.
   */
  async returnTransfer(
    id: string,
    input: {
      quantity?: number;
      reason?: string;
      requireConfirmation?: boolean;
    },
    userId: string,
    tenantId: string,
  ): Promise<StockTransfer> {
    const original = await this.findTransfer(id, tenantId);
    if (original.type !== 'TRANSFER') {
      throw new BadRequestException(
        'Los préstamos se cierran con Retornar, no con una devolución',
      );
    }
    if (original.status !== 'RECEIVED') {
      throw new BadRequestException(
        'Solo se devuelve un traslado que el destino ya recibió. ' +
          (original.status === 'PENDING'
            ? 'Este sigue en tránsito: recházalo o cancélalo.'
            : `Este está ${DESCRIPCION_DE_TRASLADO[original.status]}.`),
      );
    }
    if (original.returnOfTransferId) {
      throw new BadRequestException(
        'Esta remisión ya es una devolución: no se devuelve una devolución.',
      );
    }

    const pendiente = original.quantity - (original.returnedQuantity ?? 0);
    if (pendiente <= 0) {
      throw new BadRequestException(
        'De este traslado ya se devolvió todo lo que se había enviado.',
      );
    }
    const cantidad = input.quantity ?? pendiente;
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new BadRequestException(
        'La cantidad a devolver debe ser mayor a 0',
      );
    }
    if (cantidad > pendiente) {
      throw new BadRequestException(
        `Solo quedan ${pendiente} por devolver de este traslado ` +
          `(se enviaron ${original.quantity} y ya volvieron ${original.returnedQuantity ?? 0}).`,
      );
    }

    // La devolución va en sentido contrario: sale del destino y vuelve al
    // origen. Reusa el mismo camino que un traslado normal para que el stock,
    // los movimientos y el bloqueo de fila se comporten igual.
    const dto: TransferStockDto = {
      variantId: original.variantId,
      fromWarehouseId: original.toWarehouseId,
      toWarehouseId: original.fromWarehouseId,
      quantity: cantidad,
      notes:
        input.reason?.trim() ||
        `Devolución del traslado ${original.transferNumber ?? original.id.slice(0, 8)}`,
      requireConfirmation: input.requireConfirmation,
    };
    const resultado = await this.transferStock(dto, userId, tenantId);

    // `transferStock` devuelve la remisión si va en tránsito, y los stocks más
    // la remisión si se aplicó de una. En ambos casos sale la fila exacta: no
    // hay que buscarla «por la última», que con dos personas devolviendo a la
    // vez podría entregar la del otro.
    const devolucion = 'transfer' in resultado ? resultado.transfer : resultado;

    devolucion.returnOfTransferId = original.id;
    devolucion.reason = input.reason?.trim() || null;
    await this.transferRepository.save(devolucion);

    original.returnedQuantity = (original.returnedQuantity ?? 0) + cantidad;
    // Solo se marca RETURNED cuando volvió todo: si volvió una parte, el
    // traslado sigue siendo un traslado recibido con una devolución parcial.
    if (original.returnedQuantity >= original.quantity) {
      original.status = 'RETURNED';
      original.closedById = userId;
      original.closedAt = new Date();
    }
    await this.transferRepository.save(original);

    return this.findTransfer(devolucion.id, tenantId);
  }

  // F4: préstamo rápido. Mueve el stock INMEDIATO al destino (para que puedan
  // facturar) y queda PENDING (préstamo abierto) hasta que se retorne.
  async createLoan(
    dto: TransferStockDto,
    userId: string,
    tenantId: string,
  ): Promise<StockTransfer> {
    // «No puede vender ni prestar»: prestar mercancía de un local con el turno
    // ya cerrado es exactamente lo que el cierre viene a evitar, porque sale
    // del inventario que se acaba de cuadrar.
    await this.caja.exigirTurnoAbierto(tenantId, userId, dto.fromWarehouseId);
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'La bodega origen y destino deben ser diferentes',
      );
    }
    const settings = await this.settingsRepository.findOne({
      where: { tenantId },
    });
    if (!settings?.quickLoanEnabled) {
      throw new BadRequestException(
        'Los préstamos rápidos no están habilitados para esta tienda',
      );
    }
    const loanId = await this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);
      const transferRepo = manager.getRepository(StockTransfer);

      const fromStock = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.fromWarehouseId,
          tenantId,
        },
      });
      if (!fromStock || fromStock.quantity < dto.quantity) {
        throw new BadRequestException(
          `Stock insuficiente en bodega origen. Disponible: ${fromStock?.quantity ?? 0}`,
        );
      }

      const loan = await transferRepo.save(
        transferRepo.create({
          transferNumber: await this.siguienteNumeroDeTraslado(
            manager,
            tenantId,
          ),
          type: 'LOAN',
          status: 'PENDING',
          variantId: dto.variantId,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
          notes: dto.notes ?? null,
          createdById: userId,
          tenantId,
        }),
      );

      // Un préstamo mueve la mercancía de verdad —el otro local la puede
      // vender— así que los bultos viajan con ella y conservan su código.
      await this.ledger.trasladar(manager, {
        variantId: dto.variantId,
        desdeWarehouseId: dto.fromWarehouseId,
        hastaWarehouseId: dto.toWarehouseId,
        cantidad: dto.quantity,
        motivo: 'TRANSFER_OUT',
        referenciaId: loan.id,
        notas: dto.notes || 'Préstamo',
        usuarioId: userId,
        tenantId,
      });

      return loan.id;
    });
    return this.findTransfer(loanId, tenantId);
  }

  // Retorna un préstamo PENDING: devuelve el stock del destino al origen.
  async returnLoan(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<StockTransfer> {
    await this.dataSource.transaction(async (manager) => {
      const transferRepo = manager.getRepository(StockTransfer);
      const stockRepo = manager.getRepository(Stock);

      const loan = await transferRepo.findOne({ where: { id, tenantId } });
      if (!loan) throw new NotFoundException('Préstamo no encontrado');
      if (loan.type !== 'LOAN') {
        throw new BadRequestException('Esta remisión no es un préstamo');
      }
      if (loan.status !== 'PENDING') {
        throw new BadRequestException(
          `El préstamo ya está en estado ${loan.status}`,
        );
      }

      const toStock = await stockRepo.findOne({
        where: {
          variantId: loan.variantId,
          warehouseId: loan.toWarehouseId,
          tenantId,
        },
      });
      // Si ya se vendió desde el destino puede no haber stock para retornar.
      if (!toStock || toStock.quantity < loan.quantity) {
        throw new BadRequestException(
          `No hay stock suficiente en el destino para retornar (posiblemente ya se vendió). ` +
            `Disponible: ${toStock?.quantity ?? 0}, Préstamo: ${loan.quantity}`,
        );
      }

      // La mercancía vuelve por donde vino, con sus mismos códigos.
      await this.ledger.trasladar(manager, {
        variantId: loan.variantId,
        desdeWarehouseId: loan.toWarehouseId,
        hastaWarehouseId: loan.fromWarehouseId,
        cantidad: loan.quantity,
        motivo: 'TRANSFER_IN',
        referenciaId: loan.id,
        notas: 'Retorno de préstamo',
        usuarioId: userId,
        tenantId,
      });

      loan.status = 'RETURNED';
      loan.receivedById = userId;
      loan.receivedAt = new Date();
      await transferRepo.save(loan);
    });
    return this.findTransfer(id, tenantId);
  }

  async findTransfer(id: string, tenantId: string): Promise<StockTransfer> {
    const transfer = await this.transferRepository.findOne({
      where: { id, tenantId },
      relations: ['variant', 'variant.product', 'fromWarehouse', 'toWarehouse'],
    });
    if (!transfer) throw new NotFoundException('Remisión no encontrada');
    return transfer;
  }

  /**
   * El historial de traslados: qué se movió, quién lo mandó, quién lo recibió
   * y qué pasó con él.
   *
   * La pantalla anterior mostraba producto, bodegas, cantidad y estado. Al
   * revisar un traslado de hace dos semanas faltaba justo lo que se pregunta:
   * **quién** lo hizo, **cuándo**, con **qué código** —el que trae el zapato,
   * no un uuid— y, si nunca llegó, **por qué**.
   *
   * También trae la devolución: cuánto de lo enviado ya volvió, para no tener
   * que cruzar dos remisiones a ojo.
   */
  async listTransfers(
    tenantId: string,
    filters?: {
      type?: string;
      status?: string;
      warehouseId?: string;
      q?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    data: TrasladoConContexto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
    const page = Math.max(filters?.page ?? 1, 1);

    const qb = this.transferRepository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.variant', 'v')
      .leftJoinAndSelect('v.sizeRef', 'vsize')
      .leftJoinAndSelect('v.colorRef', 'vcolor')
      .leftJoinAndSelect('v.product', 'p')
      .leftJoinAndSelect('t.fromWarehouse', 'fw')
      .leftJoinAndSelect('t.toWarehouse', 'tw')
      .where('t.tenant_id = :tenantId', { tenantId });

    if (filters?.type) qb.andWhere('t.type = :type', { type: filters.type });
    if (filters?.status)
      qb.andWhere('t.status = :status', { status: filters.status });
    if (filters?.warehouseId) {
      qb.andWhere('(t.from_warehouse_id = :wh OR t.to_warehouse_id = :wh)', {
        wh: filters.warehouseId,
      });
    }
    // Buscar por lo que la tienda tiene a mano: el nombre o el código pegado
    // en la caja. Va en un solo `andWhere` porque mezclar `orWhere` con
    // `andWhere` rompe la agrupación del SQL.
    const q = filters?.q?.trim();
    if (q) {
      qb.andWhere(
        '(p.name ILIKE :q OR p.sku_prefix ILIKE :q OR v.sku ILIKE :q ' +
          'OR v.barcode ILIKE :q OR t.transfer_number ILIKE :q)',
        { q: `%${q}%` },
      );
    }
    if (filters?.from) {
      qb.andWhere('t.created_at >= :from', {
        from: desdeInicioDelDia(filters.from),
      });
    }
    if (filters?.to) {
      qb.andWhere('t.created_at <= :to', { to: hastaFinDelDia(filters.to) });
    }

    const [filas, total] = await qb
      // La **propiedad**, no la columna: al paginar, TypeORM reescribe la
      // consulta con una subconsulta de ids y necesita poder mapear el orden.
      // Con `t.created_at` revienta con «Cannot read properties of undefined».
      .orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Los responsables. Se resuelven en una consulta aparte, y no con un JOIN,
    // porque de un usuario aquí solo se muestra el nombre: traer la entidad
    // entera arrastraría su hash de contraseña hasta esta pantalla.
    const nombrePorUsuario = await this.nombresDeUsuarios(
      filas.flatMap((f) => [f.createdById, f.receivedById, f.closedById]),
      tenantId,
    );

    // Cuánto de cada traslado ya volvió y en qué remisión. Una sola consulta
    // para todo el lote: pedirlo fila por fila era N+1 en la pantalla que más
    // se abre del módulo.
    const ids = filas.map((f) => f.id);
    const devoluciones = ids.length
      ? await this.transferRepository.find({
          where: { tenantId, returnOfTransferId: In(ids) },
          order: { createdAt: 'ASC' },
        })
      : [];
    const porOriginal = new Map<string, StockTransfer[]>();
    for (const d of devoluciones) {
      const clave = d.returnOfTransferId!;
      porOriginal.set(clave, [...(porOriginal.get(clave) ?? []), d]);
    }

    return {
      data: filas.map((t) =>
        this.describirTraslado(t, porOriginal, nombrePorUsuario),
      ),
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  /** El detalle de una remisión, con la misma forma que la lista. */
  async getTransferDetail(
    id: string,
    tenantId: string,
  ): Promise<TrasladoConContexto> {
    const t = await this.findTransfer(id, tenantId);
    const devoluciones = await this.transferRepository.find({
      where: { tenantId, returnOfTransferId: id },
      order: { createdAt: 'ASC' },
    });
    const nombres = await this.nombresDeUsuarios(
      [t.createdById, t.receivedById, t.closedById],
      tenantId,
    );
    return this.describirTraslado(t, new Map([[id, devoluciones]]), nombres);
  }

  /** Nombre legible de cada usuario, por id. Ignora los nulos y repetidos. */
  private async nombresDeUsuarios(
    ids: (string | null | undefined)[],
    tenantId: string,
  ): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unicos.length) return new Map();
    const usuarios = await this.dataSource.getRepository(User).find({
      where: { id: In(unicos), tenantId },
      select: ['id', 'firstName', 'lastName', 'email'],
    });
    return new Map(
      usuarios.map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email,
      ]),
    );
  }

  /** Traduce una fila de remisión a lo que la pantalla necesita mostrar. */
  private describirTraslado(
    t: StockTransfer,
    porOriginal: Map<string, StockTransfer[]>,
    nombres: Map<string, string>,
  ): TrasladoConContexto {
    const nombre = (id?: string | null) => (id && nombres.get(id)) || null;
    const propias = porOriginal.get(t.id) ?? [];
    const devuelto = t.returnedQuantity ?? 0;
    return {
      id: t.id,
      transferNumber: t.transferNumber ?? null,
      type: t.type,
      status: t.status,
      quantity: t.quantity,
      returnedQuantity: devuelto,
      // Lo que todavía está en el destino. Es la cifra que se mira para
      // decidir si queda algo por devolver.
      pendingReturn: t.status === 'RECEIVED' ? t.quantity - devuelto : 0,
      notes: t.notes ?? null,
      reason: t.reason ?? null,
      createdAt: t.createdAt,
      receivedAt: t.receivedAt ?? null,
      closedAt: t.closedAt ?? null,
      createdByName: nombre(t.createdById),
      receivedByName: nombre(t.receivedById),
      closedByName: nombre(t.closedById),
      variantId: t.variantId,
      productId: t.variant?.product?.id ?? null,
      productName: t.variant?.product?.name ?? null,
      // Los tres códigos que identifican lo que se movió: la referencia del
      // producto —la que va impresa en la caja—, el SKU de la talla exacta y
      // el código de barras que lee el escáner.
      productCode: t.variant?.product?.skuPrefix ?? null,
      variantSku: t.variant?.sku ?? null,
      barcode: t.variant?.barcode ?? null,
      size: t.variant?.sizeName ?? null,
      color: t.variant?.colorName ?? null,
      fromWarehouseId: t.fromWarehouseId,
      fromWarehouseName: t.fromWarehouse?.name ?? null,
      toWarehouseId: t.toWarehouseId,
      toWarehouseName: t.toWarehouse?.name ?? null,
      returnOfTransferId: t.returnOfTransferId ?? null,
      returns: propias.map((d) => ({
        id: d.id,
        transferNumber: d.transferNumber ?? null,
        quantity: d.quantity,
        status: d.status,
        createdAt: d.createdAt,
      })),
    };
  }

  /**
   * El siguiente número de remisión del tenant: «TR-00042».
   *
   * Se toma el máximo y se suma uno, no un COUNT: borrar una fila haría que el
   * COUNT repitiera un número que ya se usó, y el índice único lo rechazaría.
   * El `advisory lock` evita que dos traslados simultáneos pidan el mismo —el
   * mismo patrón que ya usan las solicitudes internas—.
   */
  private async siguienteNumeroDeTraslado(
    manager: import('typeorm').EntityManager,
    tenantId: string,
  ): Promise<string> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `stock-transfer-number:${tenantId}`,
    ]);
    const fila = await manager
      .getRepository(StockTransfer)
      .createQueryBuilder('t')
      .select(
        "MAX(CAST(substring(t.transfer_number FROM '^TR-0*([0-9]+)$') AS integer))",
        'max',
      )
      .where('t.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    return `TR-${String(Number(fila?.max ?? 0) + 1).padStart(5, '0')}`;
  }

  // getOrCreateStock dentro de una transacción (usa el manager).
  private async getOrCreateStockTx(
    manager: import('typeorm').EntityManager,
    variantId: string,
    warehouseId: string,
    tenantId: string,
  ): Promise<Stock> {
    const stockRepo = manager.getRepository(Stock);
    let stock = await stockRepo.findOne({
      where: { variantId, warehouseId, tenantId },
    });
    if (!stock) {
      stock = stockRepo.create({
        variantId,
        warehouseId,
        tenantId,
        quantity: 0,
        minStock: 0,
      });
      stock = await stockRepo.save(stock); // ledger-exento: la crea en cero
    }
    return stock;
  }

  // ─── Movements ───

  /**
   * Qué se movió en el inventario, con foco en **un día**.
   *
   * La pantalla mostraba los últimos cincuenta de toda la bodega, sin fecha y
   * sin paginar. Una tienda lo dijo así: quiere saber qué se movió en una sola
   * fecha, sin ir producto por producto. Con cincuenta filas mezcladas, para
   * revisar un día había que abrir el historial de cada referencia.
   *
   * Devuelve además el resumen del periodo —cuánto entró, cuánto salió y
   * cuántas referencias se tocaron—, que es lo que se mira primero al cuadrar
   * el día.
   */
  async getMovements(
    tenantId: string,
    filters?: {
      warehouseId?: string;
      variantId?: string;
      movementType?: MovementType;
      limit?: number;
      page?: number;
      from?: string;
      to?: string;
      q?: string;
    },
  ): Promise<{
    data: MovimientoConContexto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    resumen: {
      entradas: number;
      salidas: number;
      referencias: number;
      ajustes: number;
    };
  }> {
    const limit = Math.min(Math.max(Number(filters?.limit) || 50, 1), 200);
    const page = Math.max(Number(filters?.page) || 1, 1);

    const base = () => {
      const qb = this.movementRepository
        .createQueryBuilder('m')
        .innerJoin('m.variant', 'v')
        .innerJoin('v.product', 'p')
        .where('m.tenant_id = :tenantId', { tenantId });

      if (filters?.warehouseId)
        qb.andWhere('m.warehouse_id = :warehouseId', {
          warehouseId: filters.warehouseId,
        });
      if (filters?.variantId)
        qb.andWhere('m.variant_id = :variantId', {
          variantId: filters.variantId,
        });
      if (filters?.movementType)
        qb.andWhere('m.movement_type = :movementType', {
          movementType: filters.movementType,
        });

      // Instantes completos: el servidor corre en UTC y la pantalla es la que
      // sabe en qué huso está la tienda. Con una fecha pelada, «hoy» empezaba
      // a las 7 de la tarde de ayer.
      const desde = parseInstante(filters?.from);
      const hasta = parseInstante(filters?.to);
      if (desde) qb.andWhere('m.created_at >= :desde', { desde });
      if (hasta) qb.andWhere('m.created_at <= :hasta', { hasta });

      const texto = filters?.q?.trim();
      if (texto) {
        qb.andWhere('(p.name ILIKE :texto OR v.sku ILIKE :texto)', {
          texto: `%${texto}%`,
        });
      }
      return qb;
    };

    const total = await base().getCount();

    // El resumen del periodo completo, no de la página: es el número con el
    // que se cuadra el día. El signo se deduce del tipo, igual que en la
    // pantalla, porque la columna guardada no es comparable entre módulos.
    const resumenCrudo = await base()
      .select(
        `COALESCE(SUM(CASE WHEN m.movement_type = 'IN' THEN ABS(m.quantity)
                           WHEN m.movement_type = 'TRANSFER' AND m.quantity > 0 THEN m.quantity
                           ELSE 0 END), 0)`,
        'entradas',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN m.movement_type = 'OUT' THEN ABS(m.quantity)
                           WHEN m.movement_type = 'TRANSFER' AND m.quantity < 0 THEN ABS(m.quantity)
                           ELSE 0 END), 0)`,
        'salidas',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE m.movement_type = 'ADJUSTMENT')`,
        'ajustes',
      )
      .addSelect('COUNT(DISTINCT p.id)', 'referencias')
      .getRawOne<{
        entradas: string;
        salidas: string;
        ajustes: string;
        referencias: string;
      }>();

    const ids = await base()
      .select('m.id', 'id')
      .orderBy('m.created_at', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .limit(limit)
      .offset((page - 1) * limit)
      .getRawMany<{ id: string }>();

    const filas = ids.length
      ? await this.movementRepository.find({
          where: { id: In(ids.map((r) => r.id)), tenantId },
          relations: ['variant', 'variant.product', 'warehouse', 'createdBy'],
          order: { createdAt: 'DESC', id: 'DESC' },
        })
      : [];

    const data: MovimientoConContexto[] = filas.map((m) => ({
      id: m.id,
      date: m.createdAt,
      movementType: m.movementType,
      quantity: Number(m.quantity),
      productId: m.variant?.product?.id ?? null,
      productName: m.variant?.product?.name ?? '',
      variantSku: m.variant?.sku ?? '',
      productCode: m.variant?.product?.skuPrefix ?? null,
      barcode: m.variant?.barcode ?? null,
      unitBarcodes: m.unitBarcodes?.length ? m.unitBarcodes : null,
      variantLabel:
        [m.variant?.size, m.variant?.color].filter(Boolean).join(' / ') || '',
      warehouseName: m.warehouse?.name ?? '',
      referenceType: m.referenceType ?? null,
      referenceId: m.referenceId ?? null,
      referenceLabel: null,
      counterparty: null,
      notes: m.notes ?? null,
      userName: m.createdBy
        ? `${m.createdBy.firstName} ${m.createdBy.lastName}`.trim()
        : null,
      userEmail: m.createdBy?.email ?? null,
    }));

    // Con quién fue: el número de factura y el cliente o el proveedor. Dos
    // consultas por página, no una por fila.
    await this.agregarContraparte(data, tenantId);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      resumen: {
        entradas: Number(resumenCrudo?.entradas ?? 0),
        salidas: Number(resumenCrudo?.salidas ?? 0),
        ajustes: Number(resumenCrudo?.ajustes ?? 0),
        referencias: Number(resumenCrudo?.referencias ?? 0),
      },
    };
  }

  /**
   * Todo lo que le pasó a un producto, de lo más viejo a lo más nuevo.
   *
   * Lo pidió una tienda con estas palabras: «quiero saber en qué momento se
   * ingresó, si se modificó, si se le movió algo». `getMovements` no alcanzaba:
   * filtra por *variante* —y un producto tiene varias—, devuelve lo más nuevo
   * primero y entrega la cantidad con el signo crudo de la base, que no es
   * comparable entre una venta y un ajuste (ver `movement-delta.ts`).
   *
   * Acá se reúnen las variantes del producto, se normaliza el signo y se
   * reconstruye el saldo después de cada movimiento, que es lo que permite
   * mirar una fila y entender por qué el inventario quedó donde quedó.
   */
  async getProductHistory(
    productId: string,
    tenantId: string,
    filters?: {
      warehouseId?: string;
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
    },
  ) {
    const product = await this.dataSource
      .getRepository(Product)
      .findOne({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const variants = await this.dataSource
      .getRepository(ProductVariant)
      .find({ where: { productId, tenantId } });

    const ficha = {
      product: {
        id: product.id,
        name: product.name,
        skuPrefix: product.skuPrefix,
      },
      variants: variants.map((v) => ({
        id: v.id,
        label: [v.size, v.color].filter(Boolean).join(' / '),
      })),
    };
    if (variants.length === 0) {
      return {
        ...ficha,
        movements: [],
        currentStock: 0,
        total: 0,
        page: 1,
        limit: 0,
        totalPages: 0,
      };
    }
    const variantIds = variants.map((v) => v.id);

    const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500);
    const page = Math.max(filters?.page ?? 1, 1);

    const where: Record<string, unknown> = {
      tenantId,
      variantId: In(variantIds),
    };
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.from && filters?.to) {
      where.createdAt = Between(
        desdeInicioDelDia(filters.from),
        hastaFinDelDia(filters.to),
      );
    } else if (filters?.from) {
      where.createdAt = MoreThanOrEqual(desdeInicioDelDia(filters.from));
    } else if (filters?.to) {
      where.createdAt = LessThanOrEqual(hastaFinDelDia(filters.to));
    }

    const [pagina, total] = await this.movementRepository.findAndCount({
      where,
      relations: ['variant', 'warehouse', 'createdBy'],
      // Lo más nuevo primero, que es como se mira. El id desempata: con dos
      // movimientos en el mismo segundo, un orden inestable haría que una fila
      // apareciera en dos páginas y otra en ninguna.
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    const stockRows = await this.stockRepository.find({
      where: filters?.warehouseId
        ? {
            variantId: In(variantIds),
            tenantId,
            warehouseId: filters.warehouseId,
          }
        : { variantId: In(variantIds), tenantId },
    });
    const currentStock = stockRows.reduce((t, s) => t + Number(s.quantity), 0);

    // El saldo de la fila más antigua de esta página depende de todo lo que
    // pasó antes, que puede estar en otra página o fuera del filtro de fechas.
    // Sin esto, cada página empezaría a contar desde cero.
    const masAntiguo = pagina[pagina.length - 1];
    const apertura = masAntiguo
      ? await this.saldosAntesDe(
          tenantId,
          variantIds,
          masAntiguo.createdAt,
          masAntiguo.id,
          filters?.warehouseId,
        )
      : new Map<string, number>();

    // Se acumula del más viejo al más nuevo, que es el único sentido en que un
    // saldo se puede calcular: un ADJUSTMENT fija el valor y borra lo anterior.
    const saldos = new Map(apertura);
    const enOrden = [...pagina].reverse();
    const movements = enOrden.map((m) => {
      const clave = `${m.variantId}:${m.warehouseId}`;
      const delta = movementDelta(m.movementType, m.quantity);
      const previo = saldos.get(clave) ?? 0;
      const saldo = delta === null ? Math.abs(m.quantity) : previo + delta;
      saldos.set(clave, saldo);

      return {
        id: m.id,
        date: m.createdAt,
        movementType: m.movementType,
        delta,
        balance: saldo,
        quantity: m.quantity,
        variantId: m.variantId,
        variantSku: m.variant?.sku ?? null,
        barcode: m.variant?.barcode ?? null,
        // Los pares concretos que se movieron, no solo el código del modelo.
        unitBarcodes: m.unitBarcodes?.length ? m.unitBarcodes : null,
        variantLabel: [m.variant?.size, m.variant?.color]
          .filter(Boolean)
          .join(' / '),
        warehouseId: m.warehouseId,
        warehouseName: m.warehouse?.name ?? '',
        referenceType: m.referenceType ?? null,
        referenceId: m.referenceId ?? null,
        // Los llena `agregarContraparte`; van declarados acá para que el
        // contrato de la respuesta no dependa de si esa consulta encontró algo.
        referenceLabel: null as string | null,
        counterparty: null as string | null,
        notes: m.notes ?? null,
        userEmail: m.createdBy?.email ?? null,
        // El nombre y no el correo: la tienda pregunta «¿quién sacó esto?» y
        // «bodega@…» no responde eso —detrás de esa cuenta hay una persona—.
        userName:
          [m.createdBy?.firstName, m.createdBy?.lastName]
            .filter(Boolean)
            .join(' ') || null,
      };
    });

    // A quién se le vendió, a quién se le compró. Sin esto, una salida solo
    // dice «Venta VTA-20260813-0001» y hay que ir a buscarla a otra pantalla
    // para saber de quién se trata.
    await this.agregarContraparte(movements, tenantId);

    movements.reverse();

    return {
      ...ficha,
      currentStock,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      movements,
    };
  }

  /**
   * Le pone nombre a la referencia de cada movimiento.
   *
   * En la base solo queda el id interno de la venta o la compra. La pantalla
   * necesita el número («VTA-20260813-0001») y, sobre todo, con quién fue: el
   * cliente que se llevó la mercancía o el proveedor que la trajo.
   */
  private async agregarContraparte(
    movements: {
      referenceType: string | null;
      referenceId: string | null;
      referenceLabel?: string | null;
      counterparty?: string | null;
    }[],
    tenantId: string,
  ): Promise<void> {
    const idsDeVenta = new Set<string>();
    const idsDeCompra = new Set<string>();
    for (const m of movements) {
      if (!m.referenceId) continue;
      if (
        m.referenceType === 'SALE' ||
        m.referenceType === 'SALE_CANCEL' ||
        // La reversión de una factura editada también cuelga de la venta. Sin
        // esto salía en el historial como una entrada sin número de factura ni
        // cliente, justo al lado de la salida que sí los tenía.
        m.referenceType === 'SALE_EDIT'
      ) {
        idsDeVenta.add(m.referenceId);
      } else if (m.referenceType === 'PURCHASE') {
        idsDeCompra.add(m.referenceId);
      }
    }
    if (idsDeVenta.size === 0 && idsDeCompra.size === 0) return;

    const ventas = idsDeVenta.size
      ? await this.dataSource.query<
          { id: string; numero: string; contraparte: string | null }[]
        >(
          `SELECT s.id,
                  s.sale_number AS numero,
                  NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '') AS contraparte
             FROM sales s
             LEFT JOIN clients c ON c.id = s.client_id
            WHERE s.tenant_id = $1 AND s.id = ANY($2::uuid[])`,
          [tenantId, [...idsDeVenta]],
        )
      : [];

    const compras = idsDeCompra.size
      ? await this.dataSource.query<
          { id: string; numero: string; contraparte: string | null }[]
        >(
          `SELECT po.id,
                  po.order_number AS numero,
                  sup.name AS contraparte
             FROM purchase_orders po
             LEFT JOIN suppliers sup ON sup.id = po.supplier_id
            WHERE po.tenant_id = $1 AND po.id = ANY($2::uuid[])`,
          [tenantId, [...idsDeCompra]],
        )
      : [];

    const porId = new Map(
      [...ventas, ...compras].map((r) => [
        r.id,
        { numero: r.numero, contraparte: r.contraparte },
      ]),
    );

    for (const m of movements) {
      const datos = m.referenceId ? porId.get(m.referenceId) : undefined;
      if (!datos) continue;
      m.referenceLabel = datos.numero;
      // Una venta sin cliente registrado es una venta de mostrador.
      m.counterparty =
        datos.contraparte ??
        (m.referenceType === 'PURCHASE' ? null : 'Consumidor Final');
    }
  }

  /**
   * Saldo por variante y bodega justo antes de un movimiento dado.
   *
   * Va en SQL porque traer el historial completo a memoria para sumar los
   * primeros N sería justamente lo que la paginación viene a evitar. El último
   * `ADJUSTMENT` manda: fija el saldo, y solo cuenta lo que pasó después.
   */
  private async saldosAntesDe(
    tenantId: string,
    variantIds: string[],
    fecha: Date,
    id: string,
    warehouseId?: string,
  ): Promise<Map<string, number>> {
    const filtroBodega = warehouseId ? 'AND m.warehouse_id = $5' : '';
    const params: unknown[] = [tenantId, variantIds, fecha, id];
    if (warehouseId) params.push(warehouseId);

    const filas = await this.dataSource.query<
      { variant_id: string; warehouse_id: string; saldo: string }[]
    >(
      `
      WITH previos AS (
        SELECT m.variant_id, m.warehouse_id, m.movement_type, m.quantity,
               m.created_at, m.id
        FROM stock_movements m
        WHERE m.tenant_id = $1
          AND m.variant_id = ANY($2::uuid[])
          AND (m.created_at, m.id) < ($3::timestamptz, $4::uuid)
          ${filtroBodega}
      ),
      ultimo_ajuste AS (
        SELECT DISTINCT ON (variant_id, warehouse_id)
               variant_id, warehouse_id, abs(quantity) AS valor, created_at, id
        FROM previos
        WHERE movement_type = 'ADJUSTMENT'
        ORDER BY variant_id, warehouse_id, created_at DESC, id DESC
      )
      SELECT p.variant_id, p.warehouse_id,
             COALESCE(u.valor, 0) + COALESCE(SUM(
               CASE p.movement_type
                 WHEN 'IN' THEN abs(p.quantity)
                 WHEN 'OUT' THEN -abs(p.quantity)
                 WHEN 'TRANSFER' THEN p.quantity
                 ELSE 0
               END
             ) FILTER (
               WHERE u.created_at IS NULL
                  OR (p.created_at, p.id) > (u.created_at, u.id)
             ), 0) AS saldo
      FROM previos p
      LEFT JOIN ultimo_ajuste u
        ON u.variant_id = p.variant_id AND u.warehouse_id = p.warehouse_id
      GROUP BY p.variant_id, p.warehouse_id, u.valor, u.created_at, u.id
      `,
      params,
    );

    return new Map(
      filas.map((f) => [`${f.variant_id}:${f.warehouse_id}`, Number(f.saldo)]),
    );
  }

  // ─── Set min stock ───

  async setMinStock(
    variantId: string,
    warehouseId: string,
    minStock: number,
    tenantId: string,
  ): Promise<Stock> {
    const stock = await this.getOrCreateStock(variantId, warehouseId, tenantId);
    stock.minStock = minStock;
    return this.stockRepository.save(stock); // ledger-exento: cambia el mínimo, no la existencia
  }

  /**
   * Fija el mínimo de TODAS las existencias de una bodega de una sola vez.
   * Caso típico (Cesar): "avísame para reponer cuando una talla baje de 1"
   * en cada local (una muestra por talla). Evita configurar variante por variante.
   */
  async setMinStockByWarehouse(
    warehouseId: string,
    minStock: number,
    tenantId: string,
  ): Promise<{ updated: number }> {
    const res = await this.stockRepository.update(
      { warehouseId, tenantId },
      { minStock: Math.max(0, Math.floor(minStock)) },
    );
    return { updated: res.affected ?? 0 };
  }
}
