import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity.js';
import { Stock } from './entities/stock.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { StockTransfer } from './entities/stock-transfer.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { TransferStockDto } from './dto/transfer-stock.dto.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { RecipeService } from '../products/services/recipe.service.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(StockMovement)
    private readonly movementRepository: Repository<StockMovement>,
    @InjectRepository(StockTransfer)
    private readonly transferRepository: Repository<StockTransfer>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepository: Repository<StoreSettings>,
    private readonly recipeService: RecipeService,
    private readonly dataSource: DataSource,
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

  async getStockByWarehouse(
    warehouseId: string,
    tenantId: string,
  ): Promise<Stock[]> {
    return this.stockRepository.find({
      where: { warehouseId, tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
      order: { variant: { product: { name: 'ASC' } } },
    });
  }

  async getStockByVariant(
    variantId: string,
    tenantId: string,
  ): Promise<Stock[]> {
    return this.stockRepository.find({
      where: { variantId, tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
    });
  }

  async getAllStock(tenantId: string): Promise<Stock[]> {
    return this.stockRepository.find({
      where: { tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
      order: { warehouse: { name: 'ASC' } },
    });
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
      const size = s.variant.size || '(única)';
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
      stock = await this.stockRepository.save(stock);
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
      const movementRepo = manager.getRepository(StockMovement);

      let stock = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.warehouseId,
          tenantId,
        },
      });

      if (!stock) {
        stock = stockRepo.create({
          variantId: dto.variantId,
          warehouseId: dto.warehouseId,
          tenantId,
          quantity: 0,
          minStock: 0,
        });
      }

      const prevQuantity = stock.quantity;
      switch (dto.movementType) {
        case MovementType.IN:
          stock.quantity += dto.quantity;
          break;
        case MovementType.OUT:
          if (stock.quantity < dto.quantity) {
            throw new BadRequestException(
              `Stock insuficiente. Disponible: ${stock.quantity}`,
            );
          }
          stock.quantity -= dto.quantity;
          break;
        case MovementType.ADJUSTMENT:
          stock.quantity = dto.quantity;
          break;
      }

      await stockRepo.save(stock);

      const movement = movementRepo.create({
        variantId: dto.variantId,
        warehouseId: dto.warehouseId,
        tenantId,
        movementType: dto.movementType,
        quantity: dto.quantity,
        notes: dto.notes,
        createdById: userId,
      });
      await movementRepo.save(movement);

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
  ): Promise<{ from: Stock; to: Stock } | StockTransfer> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'La bodega origen y destino deben ser diferentes',
      );
    }

    // Remisiones (F3): si el tenant exige confirmación de recepción, el traslado
    // NO es inmediato: se descuenta del origen y queda en tránsito (PENDING)
    // hasta que el destino lo reciba. Off por defecto → flujo inmediato de abajo.
    const settings = await this.settingsRepository.findOne({
      where: { tenantId },
    });
    if (settings?.transferConfirmationEnabled) {
      return this.createInTransitTransfer(dto, userId, tenantId);
    }

    return this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      // Get or create source stock
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

      // Get or create destination stock
      let toStock = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.toWarehouseId,
          tenantId,
        },
      });

      if (!toStock) {
        toStock = stockRepo.create({
          variantId: dto.variantId,
          warehouseId: dto.toWarehouseId,
          tenantId,
          quantity: 0,
          minStock: 0,
        });
      }

      fromStock.quantity -= dto.quantity;
      toStock.quantity += dto.quantity;

      await stockRepo.save(fromStock);
      await stockRepo.save(toStock);

      // Record movements
      const outMovement = movementRepo.create({
        variantId: dto.variantId,
        warehouseId: dto.fromWarehouseId,
        tenantId,
        movementType: MovementType.TRANSFER,
        quantity: -dto.quantity,
        referenceType: 'TRANSFER',
        referenceId: dto.toWarehouseId,
        notes: dto.notes || `Traslado a bodega destino`,
        createdById: userId,
      });

      const inMovement = movementRepo.create({
        variantId: dto.variantId,
        warehouseId: dto.toWarehouseId,
        tenantId,
        movementType: MovementType.TRANSFER,
        quantity: dto.quantity,
        referenceType: 'TRANSFER',
        referenceId: dto.fromWarehouseId,
        notes: dto.notes || `Traslado desde bodega origen`,
        createdById: userId,
      });

      await movementRepo.save([outMovement, inMovement]);

      const from = await stockRepo.findOne({
        where: { id: fromStock.id },
        relations: ['variant', 'variant.product', 'warehouse'],
      });
      const to = await stockRepo.findOne({
        where: { id: toStock.id },
        relations: ['variant', 'variant.product', 'warehouse'],
      });

      return { from: from!, to: to! };
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
      const movementRepo = manager.getRepository(StockMovement);
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
      fromStock.quantity -= dto.quantity;
      await stockRepo.save(fromStock);

      const transfer = await transferRepo.save(
        transferRepo.create({
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

      await movementRepo.save(
        movementRepo.create({
          variantId: dto.variantId,
          warehouseId: dto.fromWarehouseId,
          tenantId,
          movementType: MovementType.TRANSFER,
          quantity: -dto.quantity,
          referenceType: 'TRANSFER_OUT',
          referenceId: transfer.id,
          notes: dto.notes || 'Remisión en tránsito',
          createdById: userId,
        }),
      );

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
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

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

      const toStock = await this.getOrCreateStockTx(
        manager,
        transfer.variantId,
        transfer.toWarehouseId,
        tenantId,
      );
      toStock.quantity += transfer.quantity;
      await stockRepo.save(toStock);

      await movementRepo.save(
        movementRepo.create({
          variantId: transfer.variantId,
          warehouseId: transfer.toWarehouseId,
          tenantId,
          movementType: MovementType.TRANSFER,
          quantity: transfer.quantity,
          referenceType: 'TRANSFER_IN',
          referenceId: transfer.id,
          notes: 'Recepción de remisión',
          createdById: userId,
        }),
      );

      transfer.status = 'RECEIVED';
      transfer.receivedById = userId;
      transfer.receivedAt = new Date();
      await transferRepo.save(transfer);
    });
    return this.findTransfer(id, tenantId);
  }

  // Cancela una remisión PENDING: devuelve el stock al origen.
  async cancelTransfer(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<StockTransfer> {
    await this.dataSource.transaction(async (manager) => {
      const transferRepo = manager.getRepository(StockTransfer);
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      const transfer = await transferRepo.findOne({ where: { id, tenantId } });
      if (!transfer) throw new NotFoundException('Remisión no encontrada');
      if (transfer.type !== 'TRANSFER') {
        throw new BadRequestException(
          'Solo se cancelan traslados; para préstamos usa Retornar',
        );
      }
      if (transfer.status !== 'PENDING') {
        throw new BadRequestException(
          `La remisión ya está en estado ${transfer.status}`,
        );
      }

      // Devolver al origen lo que estaba en tránsito (traslado).
      const fromStock = await this.getOrCreateStockTx(
        manager,
        transfer.variantId,
        transfer.fromWarehouseId,
        tenantId,
      );
      fromStock.quantity += transfer.quantity;
      await stockRepo.save(fromStock);

      await movementRepo.save(
        movementRepo.create({
          variantId: transfer.variantId,
          warehouseId: transfer.fromWarehouseId,
          tenantId,
          movementType: MovementType.TRANSFER,
          quantity: transfer.quantity,
          referenceType: 'TRANSFER_CANCEL',
          referenceId: transfer.id,
          notes: 'Cancelación de remisión (devuelto a origen)',
          createdById: userId,
        }),
      );

      transfer.status = 'CANCELLED';
      await transferRepo.save(transfer);
    });
    return this.findTransfer(id, tenantId);
  }

  // F4: préstamo rápido. Mueve el stock INMEDIATO al destino (para que puedan
  // facturar) y queda PENDING (préstamo abierto) hasta que se retorne.
  async createLoan(
    dto: TransferStockDto,
    userId: string,
    tenantId: string,
  ): Promise<StockTransfer> {
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
      const movementRepo = manager.getRepository(StockMovement);
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
      const toStock = await this.getOrCreateStockTx(
        manager,
        dto.variantId,
        dto.toWarehouseId,
        tenantId,
      );
      fromStock.quantity -= dto.quantity;
      toStock.quantity += dto.quantity;
      await stockRepo.save(fromStock);
      await stockRepo.save(toStock);

      const loan = await transferRepo.save(
        transferRepo.create({
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

      await movementRepo.save([
        movementRepo.create({
          variantId: dto.variantId,
          warehouseId: dto.fromWarehouseId,
          tenantId,
          movementType: MovementType.TRANSFER,
          quantity: -dto.quantity,
          referenceType: 'LOAN_OUT',
          referenceId: loan.id,
          notes: dto.notes || 'Préstamo (salida)',
          createdById: userId,
        }),
        movementRepo.create({
          variantId: dto.variantId,
          warehouseId: dto.toWarehouseId,
          tenantId,
          movementType: MovementType.TRANSFER,
          quantity: dto.quantity,
          referenceType: 'LOAN_IN',
          referenceId: loan.id,
          notes: dto.notes || 'Préstamo (entrada)',
          createdById: userId,
        }),
      ]);

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
      const movementRepo = manager.getRepository(StockMovement);

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
      const fromStock = await this.getOrCreateStockTx(
        manager,
        loan.variantId,
        loan.fromWarehouseId,
        tenantId,
      );
      toStock.quantity -= loan.quantity;
      fromStock.quantity += loan.quantity;
      await stockRepo.save(toStock);
      await stockRepo.save(fromStock);

      await movementRepo.save([
        movementRepo.create({
          variantId: loan.variantId,
          warehouseId: loan.toWarehouseId,
          tenantId,
          movementType: MovementType.TRANSFER,
          quantity: -loan.quantity,
          referenceType: 'LOAN_RETURN',
          referenceId: loan.id,
          notes: 'Retorno de préstamo (salida destino)',
          createdById: userId,
        }),
        movementRepo.create({
          variantId: loan.variantId,
          warehouseId: loan.fromWarehouseId,
          tenantId,
          movementType: MovementType.TRANSFER,
          quantity: loan.quantity,
          referenceType: 'LOAN_RETURN',
          referenceId: loan.id,
          notes: 'Retorno de préstamo (entrada origen)',
          createdById: userId,
        }),
      ]);

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

  async listTransfers(
    tenantId: string,
    filters?: { type?: string; status?: string; warehouseId?: string },
  ): Promise<StockTransfer[]> {
    const qb = this.transferRepository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.variant', 'v')
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
    return qb.orderBy('t.created_at', 'DESC').getMany();
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
      stock = await stockRepo.save(stock);
    }
    return stock;
  }

  // ─── Movements ───

  async getMovements(
    tenantId: string,
    filters?: {
      warehouseId?: string;
      variantId?: string;
      movementType?: MovementType;
      limit?: number;
    },
  ): Promise<StockMovement[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.variantId) where.variantId = filters.variantId;
    if (filters?.movementType) where.movementType = filters.movementType;

    return this.movementRepository.find({
      where,
      relations: ['variant', 'variant.product', 'warehouse', 'createdBy'],
      order: { createdAt: 'DESC' },
      take: filters?.limit || 100,
    });
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
    return this.stockRepository.save(stock);
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
