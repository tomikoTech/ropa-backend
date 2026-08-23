import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In, Not } from 'typeorm';
import { Sale } from './entities/sale.entity.js';
import { SaleItem } from './entities/sale-item.entity.js';
import { Payment } from './entities/payment.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from '../inventory/entities/stock-unit.entity.js';
import { StockUnitContent } from '../inventory/entities/stock-unit-content.entity.js';
import { describeBoxSizes, sortSizes } from '../inventory/box-description.js';
import {} from '../inventory/entities/stock-unit-event.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { AccountsReceivable } from './entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from './entities/accounts-receivable-payment.entity.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { UpdateSaleDto } from './dto/update-sale.dto.js';
import { RecordArPaymentDto } from './dto/record-ar-payment.dto.js';
import { StockLedgerService } from '../inventory/ledger/stock-ledger.service.js';
import { CajaService } from '../caja/caja.service.js';
import { ReposicionAutomaticaService } from '../inventory/reposicion-automatica.service.js';
import { pendienteTotal, repartirAbono } from './ar-allocation.js';
import { precioDeLinea, type ReglaDePrecio } from './precio-de-linea.js';
import { ordenarParaDescuento } from '../inventory/exhibicion.js';
import { TaxService, LineCalculation } from './services/tax.service.js';
import { InvoiceService } from './services/invoice.service.js';
import { ProductStatus } from '../common/enums/product-status.enum.js';
import { ReceiptService, ReceiptData } from './services/receipt.service.js';
import { InvoiceEmailService } from '../common/services/invoice-email.service.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Reservation } from '../reservations/entities/reservation.entity.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { SaleChannel } from '../common/enums/sale-channel.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';
import { Promoter } from '../promoters/promoter.entity.js';
import { randomUUID } from 'node:crypto';
import { diaDeCalendario } from '../common/utils/dia-de-calendario.util.js';
import { repartirPorBodega } from './reparto-de-unidades.js';
import {
  paresVigentesDeLaVenta,
  type MovimientoConPares,
} from './pares-vigentes.js';

@Injectable()
export class PosService {
  private readonly log = new Logger(PosService.name);

  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepository: Repository<SaleItem>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(AccountsReceivable)
    private readonly arRepository: Repository<AccountsReceivable>,
    @InjectRepository(AccountsReceivablePayment)
    private readonly arPaymentRepository: Repository<AccountsReceivablePayment>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(StoreSettings)
    private readonly storeSettingsRepo: Repository<StoreSettings>,
    private readonly dataSource: DataSource,
    private readonly taxService: TaxService,
    private readonly invoiceService: InvoiceService,
    private readonly receiptService: ReceiptService,
    private readonly invoiceEmailService: InvoiceEmailService,
    private readonly ledger: StockLedgerService,
    private readonly reposicion: ReposicionAutomaticaService,
    private readonly caja: CajaService,
  ) {}

  /**
   * Qué bodegas de esta tienda son la vitrina.
   *
   * Se consulta por transacción y no se cachea entre peticiones: son pocas
   * filas, y una vitrina que se acaba de configurar tiene que valer en la
   * venta siguiente, no cuando al proceso se le ocurra refrescar.
   */
  private async vitrinasDelTenant(
    manager: EntityManager,
    tenantId: string,
  ): Promise<Set<string>> {
    const filas = await manager.query<{ id: string }[]>(
      `SELECT id FROM warehouses WHERE tenant_id = $1 AND is_exhibition = true`,
      [tenantId],
    );
    return new Set(filas.map((f) => f.id));
  }

  /**
   * Create and complete a sale in a single transaction.
   * 1. Validate stock availability
   * 2. Calculate taxes
   * 3. Validate payment covers total
   * 4. Create sale + items + payments
   * 5. Deduct inventory
   * 6. Record stock movements
   */
  async createSale(
    dto: CreateSaleDto,
    userId: string,
    tenantId: string,
  ): Promise<Sale> {
    // Las dos reglas del cuadre se comprueban ANTES de abrir la transacción:
    // rechazar acá cuesta una consulta; rechazar adentro obliga a deshacer el
    // descuento de inventario y el consecutivo de factura.
    await this.caja.exigirTurnoAbierto(tenantId, userId, dto.warehouseId);
    await this.caja.exigirComprobante(tenantId, dto.payments);
    // El consecutivo de venta/factura se calcula leyendo el último existente:
    // dos cajas vendiendo a la vez pueden elegir el mismo número y chocar contra
    // el índice único. Reintentar la transacción completa (rollback + recálculo)
    // evita que la caja vea un "error interno" al cobrar.
    const fullSale = await retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (manager) => {
        const variantRepo = manager.getRepository(ProductVariant);
        const stockRepo = manager.getRepository(Stock);
        const saleRepo = manager.getRepository(Sale);
        const saleItemRepo = manager.getRepository(SaleItem);
        const paymentRepo = manager.getRepository(Payment);

        // If clientId not provided, use generic client
        let clientId = dto.clientId;
        if (!clientId) {
          const generic = await manager.getRepository(Client).findOne({
            where: { isGeneric: true, tenantId },
          });
          if (generic) {
            clientId = generic.id;
          }
        } else {
          // Validate specific client belongs to tenant
          const client = await manager.getRepository(Client).findOne({
            where: { id: dto.clientId, tenantId },
          });
          if (!client) {
            throw new NotFoundException('Cliente no encontrado');
          }
        }

        // IVA config per tenant. `applyTax` en el DTO permite decidir por venta;
        // si no viene, se usa el default del tenant (ivaEnabled). La tasa es única
        // por tienda (ivaRate), ignorando el tax_rate por producto.
        const storeSettings = await manager
          .getRepository(StoreSettings)
          .findOne({ where: { tenantId } });
        const ivaEnabled = storeSettings ? storeSettings.ivaEnabled : true;
        const applyTax = dto.applyTax ?? ivaEnabled;
        const storeIvaRate = storeSettings ? Number(storeSettings.ivaRate) : 19;
        const effectiveTaxRate = applyTax ? storeIvaRate : 0;
        const ivaMode =
          storeSettings?.ivaMode === 'added' ? 'added' : 'included';

        // Load and validate all variants + stock
        const lineCalcs: LineCalculation[] = [];
        const variantData: {
          variant: ProductVariant;
          stocks: Stock[];
          quantity: number;
          discountPercent: number;
          lineCalc: LineCalculation;
          /** Bulto etiquetado del que salió la línea, si vino de escanearlo. */
          stockUnitId?: string;
          /** Las cajas que el carrito anunció; una preferencia, no un requisito. */
          preferredStockUnitIds?: string[];
          promoter: Promoter | null;
        }[] = [];

        // Batch load all stocks for requested variants (1 query instead of N)
        const allVariantIds = dto.items.map((i) => i.variantId);
        const promoterIds = [
          ...new Set(
            dto.items
              .map((i) => i.promoterId)
              .filter((id): id is string => !!id),
          ),
        ];
        const promoters = promoterIds.length
          ? await manager.getRepository(Promoter).find({
              where: { id: In(promoterIds), tenantId, isActive: true },
            })
          : [];
        const promotersById = new Map(promoters.map((p) => [p.id, p]));
        const allStocks = await stockRepo.find({
          where: { variantId: In(allVariantIds), tenantId },
        });
        const stocksByVariant = new Map<string, Stock[]>();
        for (const s of allStocks) {
          const arr = stocksByVariant.get(s.variantId);
          if (arr) arr.push(s);
          else stocksByVariant.set(s.variantId, [s]);
        }
        // Cuáles de esas bodegas son la vitrina. Se leen una sola vez para
        // toda la factura: son pocas y no cambian a mitad de una venta.
        const vitrinas = await this.vitrinasDelTenant(manager, tenantId);

        // Separados / apartados (F6): si el tenant lo tiene habilitado, el stock
        // reservado para OTROS clientes no está disponible para esta venta. Los
        // apartados del mismo cliente se consumen al vender (ver más abajo).
        const reservationsEnabled = !!storeSettings?.reservationsEnabled;
        const reservationRepo = manager.getRepository(Reservation);
        let activeReservations: Reservation[] = [];
        const reservedTotal = new Map<string, number>();
        const reservedByClient = new Map<string, number>();
        if (reservationsEnabled) {
          activeReservations = await reservationRepo.find({
            where: { tenantId, status: 'ACTIVE', variantId: In(allVariantIds) },
          });
          for (const r of activeReservations) {
            reservedTotal.set(
              r.variantId,
              (reservedTotal.get(r.variantId) ?? 0) + Number(r.quantity),
            );
            if (clientId && r.clientId === clientId) {
              reservedByClient.set(
                r.variantId,
                (reservedByClient.get(r.variantId) ?? 0) + Number(r.quantity),
              );
            }
          }
        }

        /** Cuánto lleva pedido cada variante en los renglones ya validados. */
        const pedidoPorVariante = new Map<string, number>();

        for (const item of dto.items) {
          const promoter = item.promoterId
            ? promotersById.get(item.promoterId)
            : undefined;
          if (item.promoterId && !promoter) {
            throw new BadRequestException(
              'El impulsador elegido no existe o está inactivo. Actualiza la lista e intenta de nuevo.',
            );
          }
          const variant = await variantRepo.findOne({
            where: { id: item.variantId },
            relations: ['product'],
          });
          if (!variant) {
            throw new NotFoundException(
              `Variante ${item.variantId} no encontrada`,
            );
          }
          if (variant.tenantId !== tenantId) {
            throw new NotFoundException(
              `Variante ${item.variantId} no encontrada`,
            );
          }
          if (
            !variant.isActive ||
            variant.product.status !== ProductStatus.ACTIVE
          ) {
            throw new BadRequestException(
              `Producto "${variant.product.name}" (${variant.sku}) no está activo`,
            );
          }

          // De dónde se descuenta y en qué orden: primero donde se cobra,
          // después la que más tenga, y **la vitrina de última** —vender la
          // muestra teniendo pares en la bodega deja el local sin qué
          // mostrar—. La regla vive en `exhibicion.ts`, probada aparte.
          const itemStocks = ordenarParaDescuento(
            stocksByVariant.get(item.variantId) || [],
            dto.warehouseId,
            (id) => vitrinas.has(id),
          );
          stocksByVariant.set(item.variantId, itemStocks);
          const totalAvailable = itemStocks.reduce(
            (sum, s) => sum + Number(s.quantity),
            0,
          );
          // Apartados de otros clientes reducen el disponible para esta venta.
          const reservedOthers =
            (reservedTotal.get(item.variantId) ?? 0) -
            (reservedByClient.get(item.variantId) ?? 0);
          // Y lo que ya se llevaron los renglones anteriores de esta misma
          // factura. La validación corre entera antes de descontar, así que dos
          // líneas de la misma referencia —con distinto impulsador o distinto
          // descuento, que es lo que las separa— se validaban las dos contra el
          // total: la factura salía por cuatro pares y el inventario movía tres.
          const yaPedido = pedidoPorVariante.get(item.variantId) ?? 0;
          const effectiveAvailable = totalAvailable - reservedOthers - yaPedido;
          if (effectiveAvailable < item.quantity) {
            const reservedMsg =
              reservedOthers > 0 ? ` (${reservedOthers} apartado(s))` : '';
            throw new BadRequestException(
              `Stock insuficiente para "${variant.product.name}" ${variant.sizeName}/${variant.colorName}. ` +
                `Disponible: ${effectiveAvailable}${reservedMsg}, Solicitado: ${item.quantity}`,
            );
          }

          // Precio: la regla vive aparte y se prueba sola. Decide entre el
          // precio fijo, el mínimo y el sugerido, en ese orden de mando.
          const taxRate = effectiveTaxRate;
          const discountPercent = item.discountPercent || 0;
          const resuelto = precioDeLinea(
            {
              precioProducto: Number(variant.product.basePrice),
              precioVariante: variant.priceOverride
                ? Number(variant.priceOverride)
                : null,
              precioMinimo: Number(variant.product.minimumSalePrice) || null,
              precioFijo: !!variant.product.fixedPrice,
            },
            { unitPrice: item.unitPrice, discountPercent },
          );
          if (resuelto.error !== undefined) {
            throw new BadRequestException(
              `"${variant.product.name}" ${variant.sizeName}/${variant.colorName}: ${resuelto.error}`,
            );
          }
          const unitPrice = resuelto.precio!;

          const lineCalc = this.taxService.calculateLine(
            unitPrice,
            item.quantity,
            discountPercent,
            taxRate,
            ivaMode,
          );
          lineCalcs.push(lineCalc);
          pedidoPorVariante.set(item.variantId, yaPedido + item.quantity);

          variantData.push({
            variant,
            stocks: itemStocks,
            quantity: item.quantity,
            discountPercent,
            lineCalc,
            stockUnitId: item.stockUnitId,
            preferredStockUnitIds: item.preferredStockUnitIds,
            promoter: promoter ?? null,
          });
        }

        // Calculate sale totals
        const saleTotals = this.taxService.calculateSaleTotals(lineCalcs);

        // Separate regular payments from credit
        const regularPayments = dto.payments.filter(
          (p) => p.method !== PaymentMethod.CREDITO,
        );
        const creditPayments = dto.payments.filter(
          (p) => p.method === PaymentMethod.CREDITO,
        );
        const totalRegular = regularPayments.reduce(
          (sum, p) => sum + p.amount,
          0,
        );
        const totalCredit = creditPayments.reduce(
          (sum, p) => sum + p.amount,
          0,
        );

        // Venta PENDIENTE DE PAGO: no-crédito que no se marca como pagada al crear.
        // No exige cubrir el total ni registra pagos; se marca luego desde Ventas.
        const isPending = dto.markAsPaid === false && totalCredit === 0;

        // Con qué se iba a pagar. Solo se guarda si la venta queda pendiente:
        // cuando se paga de una, el método ya vive en la fila de `payments`.
        // Una tienda cobró por transferencia, la factura salió «Sin pagar» y al
        // confirmarla el sistema volvió a preguntar el método, porque al no
        // crear `payments` lo elegido se perdía.
        const intendedPaymentMethod = isPending
          ? (regularPayments[0]?.method ?? null)
          : null;

        if (!isPending && totalRegular + totalCredit < saleTotals.total) {
          throw new BadRequestException(
            `Pago insuficiente. Total: $${saleTotals.total}, Pagado: $${totalRegular + totalCredit}`,
          );
        }

        // If credit, require real client and due date
        if (totalCredit > 0) {
          const client = clientId
            ? await manager
                .getRepository(Client)
                .findOne({ where: { id: clientId, tenantId } })
            : null;
          if (!client || client.isGeneric) {
            throw new BadRequestException(
              'Las ventas a crédito requieren un cliente registrado (no genérico)',
            );
          }
          if (!dto.creditDueDate) {
            throw new BadRequestException(
              'Las ventas a crédito requieren fecha de vencimiento',
            );
          }
        }

        // Generate numbers
        const saleNumber =
          await this.invoiceService.generateSaleNumber(tenantId);
        const invoiceNumber =
          await this.invoiceService.generateInvoiceNumber(tenantId);

        // Create sale
        const sale = saleRepo.create({
          saleNumber,
          invoiceNumber,
          clientId,
          userId,
          warehouseId: dto.warehouseId,
          subtotal: saleTotals.subtotal,
          discountAmount: saleTotals.discountAmount,
          taxAmount: saleTotals.taxAmount,
          total: saleTotals.total,
          status: SaleStatus.COMPLETED,
          saleChannel: dto.saleChannel || SaleChannel.POS,
          isPaid: !isPending,
          intendedPaymentMethod,
          notes: dto.notes,
          tenantId,
        });
        const savedSale = await saleRepo.save(sale);

        // Puntas + comisión (F2): si el tenant activó la comisión por punta, se
        // marca el ítem y se calcula la comisión (fija por par o % del valor).
        const leftoverCommissionEnabled =
          !!storeSettings?.leftoverCommissionEnabled;

        // Saldo por (variante, bodega) a medida que la venta lo consume.
        //
        // Las filas de `stock` se leen una sola vez, antes de descontar, y se
        // comparten entre los renglones de la misma referencia. Antes el
        // descuento las mutaba en memoria y el segundo renglón veía el saldo
        // ya bajado; ahora el saldo lo devuelve el ledger, y sin este mapa ese
        // renglón repartiría sobre cifras viejas.
        const saldoEnMemoria = new Map<string, number>();
        const disponible = (
          variantId: string,
          warehouseId: string,
          fila: Stock,
        ) =>
          saldoEnMemoria.get(`${variantId}|${warehouseId}`) ??
          Number(fila.quantity);
        const anotarSaldo = (
          variantId: string,
          warehouseId: string,
          saldo: number,
        ) => saldoEnMemoria.set(`${variantId}|${warehouseId}`, saldo);

        // Create sale items
        for (const data of variantData) {
          let isLeftover = false;
          let commissionAmount = 0;
          if (leftoverCommissionEnabled) {
            isLeftover = await this.isProductLeftover(
              manager,
              data.variant.product,
              storeSettings,
              tenantId,
            );
            if (isLeftover) {
              const mode = storeSettings.leftoverCommissionMode;
              const value = Number(storeSettings.leftoverCommissionValue) || 0;
              commissionAmount =
                mode === 'percent'
                  ? Math.round(data.lineCalc.lineTotal * value) / 100
                  : value * data.quantity;
            }
          }

          // Si la línea salió de escanear un bulto, se resuelve ANTES de crear
          // la línea: de ese bulto sale el costo puesto en bodega (ya con tasa
          // de cambio y fletes), que es el costo real de lo que se vende. El
          // bulto se marca vendido más abajo, dentro de la misma transacción:
          // si la venta falla, sigue disponible.
          let soldUnit: StockUnit | null = null;
          if (data.stockUnitId) {
            const unitRepo = manager.getRepository(StockUnit);
            const unit = await unitRepo.findOne({
              where: { id: data.stockUnitId, tenantId },
              lock: { mode: 'pessimistic_write' },
            });
            if (!unit) {
              throw new NotFoundException('El código escaneado no existe');
            }
            if (unit.status !== StockUnitStatus.IN_STOCK) {
              throw new BadRequestException(
                `${unit.kind === StockUnitKind.BOX ? 'La caja' : 'El par'} ${unit.barcode} ya no está disponible para la venta.`,
              );
            }
            if (Number(unit.quantity) !== data.quantity) {
              throw new BadRequestException(
                `La caja ${unit.barcode} se vende completa: trae ${unit.quantity} pares.`,
              );
            }
            soldUnit = unit;
          }

          // Snapshot del costo (F9): del bulto si vino de uno, si no el costo
          // actual del producto. Queda congelado en la línea para que la
          // utilidad de esta venta no cambie cuando cambie el costo mañana.
          const unitCost = soldUnit
            ? Number(soldUnit.cost) || 0
            : Number(data.variant.product.costPrice) || 0;

          // Qué se entregó de verdad. Una caja no tiene talla: trae un
          // surtido, y hasta ahora en esa columna se copiaba la talla de la
          // variante equivalente —la primera del producto—, así que una caja
          // 36-39 quedaba facturada como «talla 36». El detalle se lee de la
          // propia caja, no de la curva del renglón: la curva puede cambiar
          // después y lo que se entrega es lo que la caja trae.
          let boxContents: { size: string; quantity: number }[] | null = null;
          if (soldUnit?.kind === StockUnitKind.BOX) {
            const filas = await manager.getRepository(StockUnitContent).find({
              where: { boxUnitId: soldUnit.id, tenantId },
              relations: { size: true },
            });
            const detalle = sortSizes(
              filas
                .filter((fila) => Number(fila.actualQuantity) > 0)
                .map((fila) => ({
                  size: fila.size?.name ?? '',
                  quantity: Number(fila.actualQuantity),
                })),
            );
            boxContents = detalle.length > 0 ? detalle : null;
          }
          const variantSize =
            soldUnit?.kind === StockUnitKind.BOX
              ? describeBoxSizes(boxContents ?? [])
              : data.variant.sizeName;

          const saleItem = saleItemRepo.create({
            saleId: savedSale.id,
            variantId: data.variant.id,
            productName: data.variant.product.name,
            variantSku: data.variant.sku,
            productCode: data.variant.product.skuPrefix ?? null,
            variantBarcode: data.variant.barcode ?? null,
            variantSize,
            variantColor: data.variant.colorName,
            unitKind: soldUnit?.kind ?? null,
            boxContents,
            quantity: data.quantity,
            unitPrice: data.lineCalc.unitPrice,
            unitCost,
            stockUnitId: soldUnit?.id ?? null,
            promoterId: data.promoter?.id ?? null,
            promoterName: data.promoter?.name ?? null,
            discountPercent: data.discountPercent,
            taxRate: data.lineCalc.taxRate,
            taxAmount: data.lineCalc.taxAmount,
            lineTotal: data.lineCalc.lineTotal,
            isLeftover,
            commissionAmount,
            tenantId,
          });
          await saleItemRepo.save(saleItem);

          // Descontar el inventario. El bulto vendido —si la línea salió de
          // escanear uno— se marca dentro del mismo movimiento: el ledger
          // mueve el agregado y el código juntos, y antes eran dos escrituras
          // que podían quedar desalineadas.
          //
          // Cuando hay bulto escaneado el descuento va **forzado a su bodega**.
          // La cascada de abajo ordena por bodega de la venta y luego por
          // cantidad, así que podía descontar de la bodega A el par que el
          // cajero acababa de escanear en la B: el código quedaba vendido en
          // un sitio y la existencia bajaba en otro, y las dos bodegas
          // quedaban mal a la vez.
          if (soldUnit) {
            const movido = await this.ledger.mover(manager, {
              variantId: data.variant.id,
              warehouseId: soldUnit.warehouseId,
              cantidad: -data.quantity,
              motivo: 'SALE',
              referenciaId: savedSale.id,
              notas: `Venta ${saleNumber}`,
              usuarioId: userId,
              unidades: [soldUnit.id],
              // El par está en la mano del cajero: si la existencia de esa
              // bodega no lo reconoce —una etiqueta fantasma de las que ya
              // había antes de todo esto—, la venta no se frena. El saldo
              // queda negativo y eso **es** el aviso: sale en el movimiento y
              // en el reporte de integridad, en vez de descontarse de otra
              // bodega y dejar el descuadre repartido en dos sitios.
              permitirNegativo: true,
              tenantId,
            });
            anotarSaldo(data.variant.id, soldUnit.warehouseId, movido.saldo);
          } else {
            // Cascada: primero la bodega de la venta, luego las demás por
            // existencia. Se relee el saldo porque el ledger ya bloqueó y
            // pudo cambiar la fila que teníamos en memoria.
            let remaining = data.quantity;
            for (const stock of data.stocks) {
              if (remaining <= 0) break;
              const available = disponible(
                data.variant.id,
                stock.warehouseId,
                stock,
              );
              if (available <= 0) continue;

              const toDeduct = Math.min(available, remaining);
              remaining -= toDeduct;

              const movido = await this.ledger.mover(manager, {
                variantId: data.variant.id,
                warehouseId: stock.warehouseId,
                cantidad: -toDeduct,
                motivo: 'SALE',
                referenciaId: savedSale.id,
                notas: `Venta ${saleNumber}`,
                usuarioId: userId,
                // Lo que el carrito le mostró al cliente sale primero, si
                // sigue disponible.
                unidadesPreferidas: data.preferredStockUnitIds,
                tenantId,
              });
              anotarSaldo(data.variant.id, stock.warehouseId, movido.saldo);
            }
            if (remaining > 0) {
              // La cascada se quedó corta. Sin esto la venta se guardaba
              // completa habiendo movido menos mercancía de la facturada, y el
              // faltante no aparecía en ninguna parte.
              throw new BadRequestException(
                `Stock insuficiente para "${data.variant.product.name}" ` +
                  `${data.variant.sizeName}/${data.variant.colorName}: ` +
                  `faltaron ${remaining} unidad(es) al descontar.`,
              );
            }
          }

          // Perfumería: si el producto (loción) tiene un frasco vinculado,
          // descontar 1 frasco por cada unidad vendida. NO bloquea la venta:
          // descuenta lo disponible y el remanente deja el frasco en negativo
          // (aviso de que hay que reponer).
          const frascoVariantId = data.variant.product.frascoVariantId;
          if (frascoVariantId) {
            const frascoStocks = await stockRepo.find({
              where: { variantId: frascoVariantId, tenantId },
              order: { quantity: 'DESC' },
            });
            let frascoRemaining = data.quantity;
            for (
              let i = 0;
              i < frascoStocks.length && frascoRemaining > 0;
              i++
            ) {
              const fs = frascoStocks[i];
              const isLast = i === frascoStocks.length - 1;
              const avail = disponible(frascoVariantId, fs.warehouseId, fs);
              // En la última fila se descuenta todo el remanente (puede quedar
              // negativo); en las demás, solo lo positivo disponible.
              const toDeduct = isLast
                ? frascoRemaining
                : Math.min(Math.max(avail, 0), frascoRemaining);
              if (toDeduct <= 0) continue;
              frascoRemaining -= toDeduct;
              const movidoFrasco = await this.ledger.mover(manager, {
                variantId: frascoVariantId,
                warehouseId: fs.warehouseId,
                cantidad: -toDeduct,
                motivo: 'SALE',
                referenciaId: savedSale.id,
                notas: `Frasco por venta ${saleNumber}`,
                usuarioId: userId,
                // El frasco puede quedar en negativo a propósito: la venta de
                // la loción no se frena por falta de envase, el saldo negativo
                // es el aviso de reponer.
                permitirNegativo: true,
                tenantId,
              });
              anotarSaldo(frascoVariantId, fs.warehouseId, movidoFrasco.saldo);
            }
          }

          // Separados (F6): al venderle al cliente que tenía el apartado, se
          // consume su reserva (FULFILLED cuando se agota), liberando el control.
          if (reservationsEnabled && clientId) {
            let toConsume = data.quantity;
            const clientResv = activeReservations
              .filter(
                (r) =>
                  r.variantId === data.variant.id &&
                  r.clientId === clientId &&
                  r.status === 'ACTIVE',
              )
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            for (const r of clientResv) {
              if (toConsume <= 0) break;
              const take = Math.min(Number(r.quantity), toConsume);
              r.quantity = Number(r.quantity) - take; // ledger-exento: es un apartado, no existencia
              toConsume -= take;
              if (r.quantity <= 0) r.status = 'FULFILLED';
              await reservationRepo.save(r);
            }
          }
        }

        // Create payments (only regular, not credit). Si la venta queda pendiente
        // de pago, no se registra ningún pago (se hará al marcarla como pagada).
        for (const p of isPending ? [] : regularPayments) {
          const receivedAmount = p.receivedAmount ?? p.amount;
          const changeAmount =
            p.method === PaymentMethod.EFECTIVO
              ? Math.max(0, receivedAmount - p.amount)
              : 0;

          const payment = paymentRepo.create({
            saleId: savedSale.id,
            method: p.method,
            amount: p.amount,
            reference: p.reference,
            bankId: p.bankId ?? null,
            receiptImageUrl: p.receiptImageUrl,
            receivedAmount,
            changeAmount,
            tenantId,
          });
          await paymentRepo.save(payment);
        }

        // Create accounts receivable if credit
        if (totalCredit > 0) {
          const arRepo = manager.getRepository(AccountsReceivable);
          const ar = arRepo.create({
            saleId: savedSale.id,
            clientId: clientId!,
            totalAmount: totalCredit,
            paidAmount: 0,
            dueDate: diaDeCalendario(dto.creditDueDate!),
            notes: dto.creditNotes,
            tenantId,
          });
          await arRepo.save(ar);
        }

        // Return full sale with relations using transaction manager
        const fullSale = await saleRepo.findOne({
          where: { id: savedSale.id, tenantId },
          relations: [
            'client',
            'user',
            'warehouse',
            'items',
            'items.variant',
            'payments',
          ],
        });
        if (!fullSale) {
          throw new NotFoundException('Venta no encontrada después de crear');
        }
        // Lo que el local se quedó sin tener, pedido solo.
        //
        // Va dentro de la transacción de la venta: si la venta se deshace, la
        // solicitud que generó también. Y no puede tumbar el cobro —la caja no
        // se queda sin vender porque el bodeguero no se enteró—, así que se
        // anota y se sigue.
        try {
          for (const data of variantData) {
            await this.reposicion.revisar(manager, {
              variantId: data.variant.id,
              productId: data.variant.productId,
              warehouseId: dto.warehouseId,
              tenantId,
              usuarioId: userId,
            });
          }
        } catch (error) {
          this.log.warn(
            `No se pudo revisar la reposición automática de la venta ${saleNumber}: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }

        return fullSale;
      }),
    );

    // Los pares que se llevó, para que salgan en el papel que se imprime al
    // cobrar y no solo al abrir la factura después.
    await this.adjuntarCodigosDeLosPares([fullSale], tenantId);

    // Send invoice email asynchronously (fire-and-forget)
    if (fullSale.client?.email) {
      const settings = await this.storeSettingsRepo.findOne({
        where: { tenantId },
      });
      this.invoiceEmailService
        .sendInvoice(tenantId, {
          invoiceNumber: fullSale.invoiceNumber,
          orderNumber: fullSale.saleNumber,
          storeName: settings?.storeName || 'MiPinta',
          customerName: `${fullSale.client.firstName} ${fullSale.client.lastName}`,
          customerEmail: fullSale.client.email,
          items: fullSale.items.map((i) => ({
            productName: i.productName,
            variantInfo: `${i.variantSize} / ${i.variantColor}`,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            lineTotal: Number(i.lineTotal),
          })),
          subtotal: Number(fullSale.subtotal),
          discountAmount: Number(fullSale.discountAmount),
          taxAmount: Number(fullSale.taxAmount),
          total: Number(fullSale.total),
          paymentMethod: fullSale.payments?.[0]?.method,
          date: fullSale.createdAt,
        })
        .catch(() => {});
    }

    return fullSale;
  }

  /**
   * Qué pares saldrían si se vendiera esto ahora.
   *
   * El carrito muestra el código de la caja **antes** de cobrar, que es lo que
   * el cliente ve y lo que la tienda dicta por teléfono. Usa la misma regla
   * que el ledger —por antigüedad— para que lo anunciado y lo vendido
   * coincidan; y si entre una cosa y otra otra caja se lleva un par, la venta
   * se resuelve sola y la factura registra la verdad.
   *
   * Devuelve menos de lo pedido cuando no hay tantos etiquetados. No es un
   * error: significa que el inventario va por delante de las etiquetas.
   */
  async paresQueSaldrian(
    variantId: string,
    warehouseId: string | null,
    cantidad: number,
    tenantId: string,
  ): Promise<{ id: string; barcode: string }[]> {
    if (cantidad <= 0) return [];
    // Sin bodega —el POS abierto en «Todas las bodegas»— se miran todas, en el
    // mismo orden en que la venta las consumiría: la que más tenga primero y
    // la vitrina de última. Antes acá se devolvía vacío, y por eso el carrito
    // mostraba solo el código de la variante: el mismo para los dos pares.
    const filas: {
      id: string;
      barcode: string;
      quantity: number;
      warehouse_id: string;
    }[] = await this.dataSource.query(
      `SELECT u.id, u.barcode, u.quantity, u.warehouse_id
         FROM stock_units u
        WHERE u.tenant_id = $1
          AND u.variant_id = $2
          AND u.status = 'IN_STOCK'
          ${warehouseId ? 'AND u.warehouse_id = $3' : ''}
        ORDER BY u.created_at ASC, u.id ASC
        LIMIT 400`,
      warehouseId
        ? [tenantId, variantId, warehouseId]
        : [tenantId, variantId],
    );

    if (!warehouseId && filas.length > 1) {
      // Cuánto hay etiquetado en cada bodega, para poder ordenarlas con la
      // misma regla que usa la venta.
      const porBodega = new Map<string, number>();
      for (const f of filas) {
        porBodega.set(
          f.warehouse_id,
          (porBodega.get(f.warehouse_id) ?? 0) + Number(f.quantity),
        );
      }
      const vitrinas = await this.vitrinasDelTenant(
        this.dataSource.manager,
        tenantId,
      );
      const orden = ordenarParaDescuento(
        [...porBodega].map(([id, quantity]) => ({
          warehouseId: id,
          quantity,
        })),
        '',
        (id) => vitrinas.has(id),
      ).map((b) => b.warehouseId);
      const puesto = new Map(orden.map((id, i) => [id, i]));
      filas.sort(
        (a, b) =>
          (puesto.get(a.warehouse_id) ?? 0) - (puesto.get(b.warehouse_id) ?? 0),
      );
    }

    const elegidos: { id: string; barcode: string }[] = [];
    let faltan = cantidad;
    for (const fila of filas) {
      if (faltan <= 0) break;
      // Una caja no se parte para vender tres pares: si no cabe entera en lo
      // que falta, se salta. Es la misma regla del ledger.
      if (Number(fila.quantity) > faltan) continue;
      elegidos.push({ id: fila.id, barcode: fila.barcode });
      faltan -= Number(fila.quantity);
    }
    return elegidos;
  }

  async sendSaleInvoice(
    saleId: string,
    email: string,
    tenantId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const sale = await this.findOne(saleId, tenantId);
    const settings = await this.storeSettingsRepo.findOne({
      where: { tenantId },
    });

    const result = await this.invoiceEmailService.sendInvoice(tenantId, {
      invoiceNumber: sale.invoiceNumber,
      orderNumber: sale.saleNumber,
      storeName: settings?.storeName || 'MiPinta',
      customerName: sale.client
        ? `${sale.client.firstName} ${sale.client.lastName}`
        : 'Consumidor Final',
      customerEmail: email,
      items: sale.items.map((i) => ({
        productName: i.productName,
        variantInfo: `${i.variantSize} / ${i.variantColor}`,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
      })),
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      taxAmount: Number(sale.taxAmount),
      total: Number(sale.total),
      paymentMethod: sale.payments?.[0]?.method,
      date: sale.createdAt,
    });

    return result;
  }

  // Determina si un producto es "punta" (F2): override manual si está definido;
  // si no, criterio automático (antigüedad ≥ meses Y ≤ tallas restantes con stock).
  private async isProductLeftover(
    manager: import('typeorm').EntityManager,
    product: { id: string; isLeftover?: boolean | null; createdAt: Date },
    settings: StoreSettings,
    tenantId: string,
  ): Promise<boolean> {
    if (product.isLeftover !== null && product.isLeftover !== undefined) {
      return product.isLeftover;
    }
    const now = new Date();
    const created = new Date(product.createdAt);
    const ageMonths =
      (now.getFullYear() - created.getFullYear()) * 12 +
      (now.getMonth() - created.getMonth());
    if (ageMonths < Number(settings.leftoverAgeMonths ?? 8)) return false;

    const raw = await manager
      .getRepository(Stock)
      .createQueryBuilder('s')
      .innerJoin('product_variants', 'pv', 'pv.id = s.variant_id')
      .where('pv.product_id = :pid', { pid: product.id })
      .andWhere('s.tenant_id = :t', { t: tenantId })
      .andWhere('s.quantity > 0')
      .select('COUNT(DISTINCT pv.sizeId)', 'cnt')
      .getRawOne<{ cnt: string }>();
    const remainingSizes = Number(raw?.cnt ?? 0);
    return remainingSizes <= Number(settings.leftoverMaxSizes ?? 2);
  }

  /**
   * Listado de ventas, **paginado en el servidor**.
   *
   * Antes devolvía la historia completa y la pantalla filtraba y paginaba en
   * el navegador. Con una tienda que lleva un año facturando eso son casi
   * diez mil ventas con sus líneas, sus pagos y su cartera: veinte megas por
   * petición. En el local, con la conexión que hay, no alcanzaba a llegar
   * antes de que el navegador cortara a los veinte segundos —y la petición se
   * repite cada vez que se edita una factura, así que corregir una factura
   * terminaba en «la conexión tardó demasiado» y la lista sin refrescar—.
   *
   * Buscar y acotar por fecha también viven acá ahora: si el filtro se
   * aplicara sobre la página, buscar una factura de marzo en la página 1 no
   * encontraría nada.
   */
  async findAll(
    filters:
      | {
          status?: SaleStatus;
          warehouseId?: string;
          userId?: string;
          from?: string;
          to?: string;
          limit?: number;
          page?: number;
          q?: string;
          saleChannel?: string;
          paid?: boolean;
          clientPhone?: string;
        }
      | undefined,
    tenantId: string,
  ): Promise<{
    data: Sale[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Vendido en **todo** el filtro, no solo en la página que se ve. */
    soldTotal: number;
  }> {
    const limit = Math.min(Math.max(Number(filters?.limit) || 20, 1), 200);
    const page = Math.max(Number(filters?.page) || 1, 1);

    // Los ids de la página se resuelven aparte: con los `leftJoin` de las
    // líneas, un `LIMIT` sobre el join cortaría una venta por la mitad.
    const base = () => {
      const qb = this.saleRepository
        .createQueryBuilder('sale')
        .leftJoin('sale.client', 'client')
        .where('sale.tenant_id = :tenantId', { tenantId });

      if (filters?.status)
        qb.andWhere('sale.status = :status', { status: filters.status });
      if (filters?.warehouseId)
        qb.andWhere('sale.warehouse_id = :warehouseId', {
          warehouseId: filters.warehouseId,
        });
      if (filters?.userId)
        qb.andWhere('sale.user_id = :userId', { userId: filters.userId });
      if (filters?.saleChannel)
        qb.andWhere('sale.sale_channel = :saleChannel', {
          saleChannel: filters.saleChannel,
        });
      if (filters?.paid !== undefined)
        qb.andWhere('sale.is_paid = :paid', { paid: filters.paid });
      if (filters?.clientPhone?.trim())
        qb.andWhere('client.phone ILIKE :phone', {
          phone: `%${filters.clientPhone.trim()}%`,
        });

      // Las fechas llegan como instantes completos: la pantalla sabe en qué
      // huso está la tienda y el servidor corre en UTC. Con una fecha pelada
      // («2026-08-18») el día se corría cinco horas.
      const desde = parseInstant(filters?.from);
      const hasta = parseInstant(filters?.to);
      if (desde) qb.andWhere('sale.created_at >= :desde', { desde });
      if (hasta) qb.andWhere('sale.created_at <= :hasta', { hasta });

      const texto = filters?.q?.trim();
      if (texto) {
        // El producto se busca con EXISTS y no con un JOIN: el JOIN dejaría
        // fuera las demás líneas de la misma factura.
        qb.andWhere(
          `(
            sale.sale_number ILIKE :texto OR
            sale.invoice_number ILIKE :texto OR
            client.first_name ILIKE :texto OR
            client.last_name ILIKE :texto OR
            client.document_number ILIKE :texto OR
            EXISTS (
              SELECT 1 FROM sale_items linea
              WHERE linea.sale_id = sale.id
                AND (linea.product_name ILIKE :texto OR linea.variant_sku ILIKE :texto)
            )
          )`,
          { texto: `%${texto}%` },
        );
      }
      return qb;
    };

    const total = await base().getCount();

    // Lo vendido del filtro completo: es el número que la tienda cuadra con
    // la caja, así que no puede depender de en qué página esté parada.
    const suma = await base()
      .andWhere('sale.status NOT IN (:...anuladas)', {
        anuladas: [SaleStatus.CANCELLED, SaleStatus.REFUNDED],
      })
      .select('COALESCE(SUM(sale.total), 0)', 'suma')
      .getRawOne<{ suma: string }>();

    const ids = await base()
      .select('sale.id', 'id')
      .orderBy('sale.created_at', 'DESC')
      .addOrderBy('sale.id', 'DESC')
      .limit(limit)
      .offset((page - 1) * limit)
      .getRawMany<{ id: string }>();

    const data = ids.length
      ? await this.saleRepository.find({
          where: { id: In(ids.map((row) => row.id)), tenantId },
          relations: [
            'client',
            'user',
            'warehouse',
            'items',
            'payments',
            'accountsReceivable',
          ],
          order: { createdAt: 'DESC' },
        })
      : [];

    // El listado abre el detalle con la fila que ya tiene: si los códigos no
    // vienen aquí, la factura en pantalla no los muestra nunca.
    await this.adjuntarCodigosDeLosPares(data, tenantId);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      soldTotal: Number(suma?.suma ?? 0),
    };
  }

  async findOne(id: string, tenantId: string): Promise<Sale> {
    const sale = await this.saleRepository.findOne({
      where: { id, tenantId },
      relations: [
        'client',
        'user',
        'warehouse',
        'items',
        'items.variant',
        'payments',
        'accountsReceivable',
        'accountsReceivable.payments',
      ],
    });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }
    await this.adjuntarCodigosDeLosPares([sale], tenantId);
    return sale;
  }

  /**
   * Qué pares concretos se llevó cada línea de la factura.
   *
   * El código que la línea guarda es el de la **variante**: identifica el
   * modelo, la talla y el color, y es el mismo para todos los pares iguales.
   * La tienda necesita el otro —el que va impreso en la caja— para saber cuál
   * de los dos pares idénticos salió con esta factura.
   *
   * Se lee de los movimientos de inventario, que es donde el ledger anota los
   * bultos que movió. Guardarlo también en la línea sería tener el mismo dato
   * en dos sitios, y tarde o temprano uno de los dos miente.
   */
  private async adjuntarCodigosDeLosPares(
    ventas: Sale[],
    tenantId: string,
  ): Promise<void> {
    const conLineas = ventas.filter((venta) => venta.items?.length);
    if (!conLineas.length) return;

    // Una sola consulta para toda la página: el listado abre el detalle con la
    // fila que ya tiene en memoria, así que si esto fuera por venta, ver
    // Ventas dispararía una consulta por cada factura de la página.
    // **Todos** los movimientos de la venta, no solo los de tipo `SALE`.
    //
    // Editar una factura deja tres: la salida original, la devolución de la
    // edición y la salida nueva. Filtrando por `reference_type = 'SALE'` se
    // colaban los códigos de la salida original —los que ya se devolvieron— y
    // el detalle terminaba mostrando el par que el cliente trajo de vuelta.
    // La cuenta se hace por signo en `pares-vigentes.ts`, probada aparte.
    const filas: {
      sale_id: string;
      variant_id: string;
      quantity: number;
      unit_barcodes: string[] | null;
      created_at: Date;
    }[] = await this.dataSource.query(
      `SELECT m.reference_id AS sale_id, m.variant_id, m.quantity,
              m.unit_barcodes, m.created_at
         FROM stock_movements m
        WHERE m.reference_id = ANY($1::text[])
          AND m.tenant_id = $2
        ORDER BY m.created_at ASC, m.id ASC`,
      [conLineas.map((venta) => venta.id), tenantId],
    );
    if (!filas.length) return;

    // Agrupadas por venta y variante, para netear cada grupo por separado: dos
    // referencias distintas de la misma factura no se mezclan.
    const movimientos = new Map<string, MovimientoConPares[]>();
    for (const fila of filas) {
      const clave = `${fila.sale_id}|${fila.variant_id}`;
      const lista = movimientos.get(clave);
      const m = {
        quantity: Number(fila.quantity),
        unitBarcodes: fila.unit_barcodes,
      };
      if (lista) lista.push(m);
      else movimientos.set(clave, [m]);
    }

    const porVenta = new Map<string, Map<string, string[]>>();
    for (const [clave, lista] of movimientos) {
      const [saleId, variantId] = clave.split('|');
      const vigentes = paresVigentesDeLaVenta(lista);
      if (!vigentes.length) continue;
      const porVariante =
        porVenta.get(saleId) ?? new Map<string, string[]>();
      porVariante.set(variantId, vigentes);
      porVenta.set(saleId, porVariante);
    }

    // Se reparten en orden entre las líneas de esa variante: si la factura
    // trae la misma referencia dos veces —distinto impulsador, distinto
    // descuento—, a cada una le tocan tantos códigos como unidades vendió.
    // El id de cada bulto además del código: la pantalla muestra el código
    // —que es el que está impreso— pero para editar la factura señalando un
    // par concreto hay que mandarle al servidor su bulto.
    const todos = [...porVenta.values()].flatMap((v) => [...v.values()].flat());
    const idPorCodigo = new Map<string, string>();
    if (todos.length) {
      const unidades: { id: string; barcode: string }[] =
        await this.dataSource.query(
          `SELECT id, barcode FROM stock_units
            WHERE tenant_id = $1 AND barcode = ANY($2::text[])`,
          [tenantId, [...new Set(todos)]],
        );
      for (const u of unidades) idPorCodigo.set(u.barcode, u.id);
    }

    for (const venta of conLineas) {
      const porVariante = porVenta.get(venta.id);
      if (!porVariante) continue;
      for (const item of venta.items) {
        const disponibles = porVariante.get(item.variantId);
        if (!disponibles?.length) continue;
        const suyos = disponibles.splice(0, item.quantity);
        item.unitBarcodes = suyos;
        item.stockUnitIds = suyos
          .map((codigo) => idPorCodigo.get(codigo))
          .filter((id): id is string => !!id);
      }
    }
  }

  /**
   * Serializa a quienes tocan la misma venta (editar y anular mueven el mismo
   * inventario). Se bloquea solo la fila de `sales`: hacerlo con las relaciones
   * cargadas obligaría a PostgreSQL a bloquear el lado nullable de un LEFT JOIN,
   * que es un error.
   */
  private async lockSaleRow(
    manager: EntityManager,
    saleId: string,
    tenantId: string,
  ): Promise<void> {
    await manager.query(
      'SELECT id FROM sales WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [saleId, tenantId],
    );
  }

  // Edita una venta y mantiene alineados sus snapshots monetarios, pagos y
  // cartera. El precio de una línea es histórico: nunca modifica el catálogo.
  async updateSale(
    id: string,
    dto: UpdateSaleDto,
    userId: string,
    tenantId: string,
  ): Promise<Sale> {
    await this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      await this.lockSaleRow(manager, id, tenantId);
      const sale = await saleRepo.findOne({
        where: { id, tenantId },
        relations: [
          'items',
          'payments',
          'accountsReceivable',
          'accountsReceivable.payments',
        ],
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('No se puede editar una venta cancelada');
      }

      const vitrinas = await this.vitrinasDelTenant(manager, tenantId);
      const originalTotal = Number(sale.total);
      const roundMoney = (value: number) => Math.round(value * 100) / 100;

      if (dto.clientId !== undefined) {
        if (dto.clientId) {
          const client = await manager.getRepository(Client).findOne({
            where: { id: dto.clientId, tenantId },
          });
          if (!client) throw new NotFoundException('Cliente no encontrado');
          if (sale.accountsReceivable.length > 0 && client.isGeneric) {
            throw new BadRequestException(
              'Una venta a crédito requiere un cliente registrado',
            );
          }
        } else if (sale.accountsReceivable.length > 0) {
          throw new BadRequestException(
            'No se puede quitar el cliente de una venta a crédito',
          );
        }
        sale.clientId = (dto.clientId ?? null) as unknown as string;
      }
      if (dto.notes !== undefined) sale.notes = dto.notes;
      if (dto.saleChannel !== undefined) sale.saleChannel = dto.saleChannel;
      if (dto.saleDate) {
        // Fecha sola (YYYY-MM-DD) -> mediodía, para que no corra al día
        // anterior por zona horaria (el servidor está en UTC).
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(dto.saleDate)
          ? `${dto.saleDate}T12:00:00`
          : dto.saleDate;
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException('Fecha de venta inválida');
        }
        sale.createdAt = parsed;
      }

      if (dto.invoiceNumber !== undefined) {
        const dup = await saleRepo.findOne({
          where: { tenantId, invoiceNumber: dto.invoiceNumber },
        });
        if (dup && dup.id !== sale.id) {
          throw new BadRequestException(
            `Ya existe una venta con la factura ${dto.invoiceNumber}`,
          );
        }
        sale.invoiceNumber = dto.invoiceNumber;
      }

      const discount =
        dto.discountAmount !== undefined
          ? dto.discountAmount
          : Number(sale.discountAmount);
      const requestedItems =
        dto.items ??
        ((dto.total !== undefined || dto.discountAmount !== undefined) &&
        sale.items.length > 0
          ? sale.items.map((item) => ({
              variantId: item.variantId,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              discountPercent: Number(item.discountPercent),
              // Solo cambia el total: los pares siguen siendo los mismos.
              stockUnitIds: item.stockUnitId ? [item.stockUnitId] : undefined,
            }))
          : undefined);

      if (
        requestedItems &&
        (requestedItems.length > 0 || sale.items.length > 0)
      ) {
        if (requestedItems.length === 0) {
          throw new BadRequestException('La venta debe tener al menos un ítem');
        }
        const stockRepo = manager.getRepository(Stock);
        const saleItemRepo = manager.getRepository(SaleItem);
        const variantRepo = manager.getRepository(ProductVariant);
        const previousByVariant = new Map(
          sale.items.map((item) => [item.variantId, item]),
        );
        const settings = await manager
          .getRepository(StoreSettings)
          .findOne({ where: { tenantId } });

        // Régimen de IVA histórico: se infiere de la igualdad que cumplía la
        // venta, porque la configuración de la tienda pudo cambiar después.
        const origSubtotal = Number(sale.subtotal) || 0;
        const origDiscount = Number(sale.discountAmount) || 0;
        const origTax = Number(sale.taxAmount) || 0;
        const origNet = origSubtotal - origDiscount;
        const ivaMode: 'included' | 'added' =
          origTax > 0 &&
          Math.abs(originalTotal - (origNet + origTax)) + 0.01 <
            Math.abs(originalTotal - origNet)
            ? 'added'
            : 'included';
        const fallbackTaxRate =
          sale.items
            .map((item) => Number(item.taxRate))
            .find((rate) => rate > 0) ??
          (origTax > 0 ? Number(settings?.ivaRate ?? 19) : 0);

        const editedItems: SaleItem[] = [];
        // La regla de precio de cada variante que toca esta edición. Editar
        // una factura tiene que respetar el precio fijo igual que venderla:
        // si no, bajarle el precio a un producto cerrado es tan fácil como
        // venderlo y después editarlo.
        const reglaPorVariante = new Map<string, ReglaDePrecio>();
        const newSubtotal = requestedItems.reduce(
          (sum, item) => sum + Number(item.unitPrice) * item.quantity,
          0,
        );

        // Si solo cambió el precio, conservar las mismas entidades SaleItem y
        // todos los movimientos de inventario. Se empareja por variante y
        // cantidad porque el DTO representa la lista completa de líneas.
        const unmatchedPrevious = [...sale.items];
        const reusablePairs = requestedItems.map((input) => {
          const index = unmatchedPrevious.findIndex(
            (previous) =>
              previous.variantId === input.variantId &&
              Number(previous.quantity) === Number(input.quantity),
          );
          if (index < 0) return null;
          return { input, previous: unmatchedPrevious.splice(index, 1)[0] };
        });
        const canReuseSaleItems =
          unmatchedPrevious.length === 0 &&
          reusablePairs.every((pair) => pair !== null);

        if (canReuseSaleItems) {
          for (const pair of reusablePairs) {
            if (!pair) continue;
            const variant = await variantRepo.findOne({
              where: { id: pair.input.variantId },
              relations: ['product'],
            });
            if (!variant || variant.tenantId !== tenantId) {
              throw new NotFoundException(
                `Variante ${pair.input.variantId} no encontrada`,
              );
            }
            pair.previous.unitPrice = Number(pair.input.unitPrice);
            if (pair.input.discountPercent !== undefined) {
              pair.previous.discountPercent = Number(
                pair.input.discountPercent,
              );
            }
            editedItems.push(pair.previous);
            reglaPorVariante.set(variant.id, {
              precioProducto: Number(variant.product.basePrice),
              precioVariante: variant.priceOverride
                ? Number(variant.priceOverride)
                : null,
              precioMinimo: Number(variant.product.minimumSalePrice) || null,
              precioFijo: !!variant.product.fixedPrice,
            });
          }
        } else {
          // Cambiar los productos obliga a recrear las líneas, y una devolución
          // apunta a la línea original: se rechaza en vez de dejar la
          // devolución colgando de una fila que ya no existe.
          if (sale.items.length > 0) {
            const devueltas: { id: string }[] = await manager.query(
              'SELECT ri.id FROM return_items ri WHERE ri.sale_item_id = ANY($1::uuid[]) LIMIT 1',
              [sale.items.map((item) => item.id)],
            );
            if (devueltas.length > 0) {
              throw new BadRequestException(
                'Esta venta tiene devoluciones registradas: no se pueden cambiar sus productos ni cantidades. ' +
                  'Anula la devolución primero, o corrige solo los precios.',
              );
            }
          }

          // 1) Revertir lo que la venta había descontado: la existencia y los
          // códigos físicos, en el mismo movimiento.
          //
          // Los movimientos anteriores ya **no se borran**. El historial de
          // inventario reconstruye el saldo sumando movimientos, y borrar el
          // descuento original dejaba un hueco: la reversión sin su descuento
          // hacía que el saldo reconstruido no cuadrara con el real. Ahora
          // queda la traza completa —descuento, devolución por edición, nuevo
          // descuento— y quien anule después lee el **neto**.
          const prevMovs = await this.netoDescontado(
            manager,
            sale.id,
            tenantId,
          );
          const unidadesPrevias = await this.unidadesDeLaVenta(
            manager,
            sale,
            tenantId,
          );
          for (const m of prevMovs) {
            const clave = `${m.variantId}|${m.warehouseId}`;
            await this.ledger.mover(manager, {
              variantId: m.variantId,
              warehouseId: m.warehouseId,
              cantidad: -m.neto,
              motivo: 'SALE_EDIT',
              referenciaId: sale.id,
              notas: `Edición venta ${sale.saleNumber}: se revierte lo anterior`,
              usuarioId: userId,
              unidades: unidadesPrevias.get(clave),
              tenantId,
            });
            unidadesPrevias.delete(clave);
          }
          // Los que no casaron con ningún punto del neto: se liberan igual.
          // Tiene que ser **antes** de resolver el bulto conservado más abajo,
          // porque el ledger no deja volver a descontar un código que sigue
          // marcado como vendido, y la edición entera moría con un mensaje que
          // no tenía nada que ver.
          await this.liberarSobrantes(
            manager,
            unidadesPrevias,
            'SALE_EDIT',
            sale,
            userId,
            tenantId,
          );
          await saleItemRepo.delete({ saleId: sale.id, tenantId });

          // 2) Aplicar los ítems nuevos (mismo patrón que createSale).
          for (const item of requestedItems) {
            const variant = await variantRepo.findOne({
              where: { id: item.variantId },
              relations: ['product'],
            });
            if (!variant || variant.tenantId !== tenantId) {
              throw new NotFoundException(
                `Variante ${item.variantId} no encontrada`,
              );
            }
            // El mismo orden que al vender —vitrina de última—: editar una
            // factura no puede descontar por un criterio distinto del que usó
            // la venta original.
            const itemStocks = ordenarParaDescuento(
              await stockRepo.find({
                where: { variantId: item.variantId, tenantId },
              }),
              sale.warehouseId,
              (id) => vitrinas.has(id),
            );
            const totalAvailable = itemStocks.reduce(
              (s, st) => s + Number(st.quantity),
              0,
            );
            if (totalAvailable < item.quantity) {
              throw new BadRequestException(
                `Stock insuficiente para "${variant.product.name}" ${variant.sizeName}/${variant.colorName}. ` +
                  `Disponible total: ${totalAvailable}, Solicitado: ${item.quantity}`,
              );
            }

            const unitPrice = Number(item.unitPrice);
            const lineTotal = unitPrice * item.quantity;
            reglaPorVariante.set(variant.id, {
              precioProducto: Number(variant.product.basePrice),
              precioVariante: variant.priceOverride
                ? Number(variant.priceOverride)
                : null,
              precioMinimo: Number(variant.product.minimumSalePrice) || null,
              precioFijo: !!variant.product.fixedPrice,
            });

            // Se consume el snapshot: si la venta traía dos líneas de la misma
            // variante, la segunda no puede heredar el mismo código físico.
            const previous = previousByVariant.get(variant.id);
            if (previous) previousByVariant.delete(variant.id);
            const taxRate = previous
              ? Number(previous.taxRate)
              : fallbackTaxRate;
            // El código físico sigue siendo el mismo par o la misma caja: sin
            // esto la venta pierde el vínculo y ese código ya no se puede
            // devolver escaneándolo.
            const keptStockUnitId =
              previous && Number(previous.quantity) === item.quantity
                ? previous.stockUnitId
                : null;
            // El bulto conservado vuelve a salir del inventario, y **de su
            // bodega**: la cascada de abajo ordena por bodega de la venta y
            // podía descontar en otra, dejando el código vendido en un sitio y
            // la existencia bajada en otro.
            const keptUnit = keptStockUnitId
              ? await manager.getRepository(StockUnit).findOne({
                  where: { id: keptStockUnitId, tenantId },
                })
              : null;

            const editedItem = await saleItemRepo.save(
              saleItemRepo.create({
                saleId: sale.id,
                variantId: variant.id,
                productName: previous?.productName ?? variant.product.name,
                variantSku: previous?.variantSku ?? variant.sku,
                productCode:
                  previous?.productCode ?? variant.product.skuPrefix ?? null,
                variantBarcode:
                  previous?.variantBarcode ?? variant.barcode ?? null,
                variantSize: previous?.variantSize ?? variant.sizeName,
                variantColor: previous?.variantColor ?? variant.colorName,
                quantity: item.quantity,
                unitPrice,
                // Si la línea ya existía, conservar todos sus snapshots
                // históricos (costo, impulsador, punta y comisión).
                unitCost:
                  previous !== undefined
                    ? Number(previous.unitCost)
                    : Number(variant.product.costPrice) || 0,
                stockUnitId: keptStockUnitId,
                // Qué era esa línea —caja o par— y con qué surtido: se
                // conserva junto al código físico. Si se perdiera, editar el
                // precio de una factura le borraría a la caja su contenido.
                unitKind: keptStockUnitId ? (previous?.unitKind ?? null) : null,
                boxContents: keptStockUnitId
                  ? (previous?.boxContents ?? null)
                  : null,
                promoterId: previous?.promoterId ?? null,
                promoterName: previous?.promoterName ?? null,
                discountPercent:
                  item.discountPercent ??
                  (previous ? Number(previous.discountPercent) : 0),
                taxRate,
                taxAmount: 0,
                lineTotal,
                isLeftover: previous?.isLeftover ?? false,
                commissionAmount: Number(previous?.commissionAmount) || 0,
                tenantId,
              }),
            );
            editedItems.push(editedItem);

            // Descontar inventario en cascada (bodega de la venta primero).
            if (keptUnit) {
              await this.ledger.mover(manager, {
                variantId: variant.id,
                warehouseId: keptUnit.warehouseId,
                cantidad: -item.quantity,
                motivo: 'SALE',
                referenciaId: sale.id,
                notas: `Edición venta ${sale.saleNumber}`,
                usuarioId: userId,
                unidades: [keptUnit.id],
                tenantId,
              });
            } else {
              // Los pares que la edición señaló por su código, si los hay.
              //
              // Sin esto el inventario elige por antigüedad, y el par que queda
              // registrado como vendido no es el que el cliente se llevó: el
              // código impreso en la caja que sigue en su casa figura como
              // devuelto. La regla del reparto vive en
              // `reparto-de-unidades.ts` y se prueba sin base de datos.
              const pedidos = item.stockUnitIds?.length
                ? await manager.getRepository(StockUnit).find({
                    where: {
                      id: In(item.stockUnitIds),
                      tenantId,
                      variantId: variant.id,
                      status: StockUnitStatus.IN_STOCK,
                    },
                  })
                : [];
              const reparto = repartirPorBodega(
                pedidos.map((u) => ({ id: u.id, warehouseId: u.warehouseId })),
                item.quantity,
              );
              for (const grupo of reparto.porBodega) {
                await this.ledger.mover(manager, {
                  variantId: variant.id,
                  warehouseId: grupo.warehouseId,
                  cantidad: -grupo.unidades.length,
                  motivo: 'SALE',
                  referenciaId: sale.id,
                  notas: `Edición venta ${sale.saleNumber}`,
                  usuarioId: userId,
                  unidades: grupo.unidades,
                  tenantId,
                });
              }

              // Lo que los pares elegidos no cubran sale de la cascada de
              // siempre: quien no elige, no cambia de comportamiento.
              let remaining = reparto.faltan;
              for (const stock of itemStocks) {
                if (remaining <= 0) break;
                // Fresco: `itemStocks` se relee dentro del bucle de ítems.
                const available = Number(stock.quantity);
                if (available <= 0) continue;
                const toDeduct = Math.min(available, remaining);
                remaining -= toDeduct;
                await this.ledger.mover(manager, {
                  variantId: variant.id,
                  warehouseId: stock.warehouseId,
                  cantidad: -toDeduct,
                  motivo: 'SALE',
                  referenciaId: sale.id,
                  notas: `Edición venta ${sale.saleNumber}`,
                  usuarioId: userId,
                  tenantId,
                });
              }
              if (remaining > 0) {
                throw new BadRequestException(
                  `Stock insuficiente para "${variant.product.name}" ` +
                    `${variant.sizeName}/${variant.colorName}: ` +
                    `faltaron ${remaining} unidad(es) al descontar.`,
                );
              }
            }

            // Perfumería: descontar 1 frasco por unidad si el producto lo tiene.
            const frascoVariantId = variant.product.frascoVariantId;
            if (frascoVariantId) {
              const frascoStocks = await stockRepo.find({
                where: { variantId: frascoVariantId, tenantId },
                order: { quantity: 'DESC' },
              });
              let frascoRemaining = item.quantity;
              for (
                let i = 0;
                i < frascoStocks.length && frascoRemaining > 0;
                i++
              ) {
                const fs = frascoStocks[i];
                const isLast = i === frascoStocks.length - 1;
                const avail = Number(fs.quantity);
                const toDeduct = isLast
                  ? frascoRemaining
                  : Math.min(Math.max(avail, 0), frascoRemaining);
                if (toDeduct <= 0) continue;
                frascoRemaining -= toDeduct;
                await this.ledger.mover(manager, {
                  variantId: frascoVariantId,
                  warehouseId: fs.warehouseId,
                  cantidad: -toDeduct,
                  motivo: 'SALE',
                  referenciaId: sale.id,
                  notas: `Frasco por edición venta ${sale.saleNumber}`,
                  usuarioId: userId,
                  permitirNegativo: true,
                  tenantId,
                });
              }
            }
          }

          // Los códigos que salieron de la venta ya volvieron a disponible en
          // la reversión de arriba, y los que se conservaron se volvieron a
          // descontar con su línea. No queda nada suelto que liberar.
        }

        const naturalTotal = editedItems.reduce(
          (sum, item) =>
            sum +
            this.taxService.calculateLine(
              Number(item.unitPrice),
              item.quantity,
              0,
              Number(item.taxRate),
              ivaMode,
            ).lineTotal,
          0,
        );
        if (dto.total !== undefined && dto.total > naturalTotal + 0.01) {
          throw new BadRequestException(
            'El total no puede superar la suma de los productos. Ajusta sus precios unitarios.',
          );
        }
        if (dto.total === undefined && discount > newSubtotal + 0.01) {
          throw new BadRequestException(
            'El descuento no puede superar el subtotal de la venta',
          );
        }
        const globalDiscountPercent =
          dto.total !== undefined
            ? naturalTotal > 0
              ? (1 - dto.total / naturalTotal) * 100
              : 0
            : newSubtotal > 0
              ? (discount / newSubtotal) * 100
              : 0;

        const lineCalcs: LineCalculation[] = [];
        const preserveLineDiscounts =
          dto.items !== undefined &&
          dto.total === undefined &&
          dto.discountAmount === undefined &&
          requestedItems.every((item) => item.discountPercent !== undefined);
        for (const [index, item] of editedItems.entries()) {
          const discountPercent = preserveLineDiscounts
            ? Number(requestedItems[index].discountPercent)
            : globalDiscountPercent;
          const regla = reglaPorVariante.get(item.variantId);
          if (regla) {
            const resuelto = precioDeLinea(regla, {
              unitPrice: Number(item.unitPrice),
              discountPercent,
            });
            if (resuelto.error !== undefined) {
              throw new BadRequestException(
                `"${item.productName}": ${resuelto.error}`,
              );
            }
          }
          const calculation = this.taxService.calculateLine(
            Number(item.unitPrice),
            item.quantity,
            discountPercent,
            Number(item.taxRate),
            ivaMode,
          );
          item.discountPercent = calculation.discountPercent;
          item.taxAmount = calculation.taxAmount;
          item.lineTotal = calculation.lineTotal;
          if (item.isLeftover && settings?.leftoverCommissionEnabled) {
            const value = Number(settings.leftoverCommissionValue) || 0;
            item.commissionAmount =
              settings.leftoverCommissionMode === 'percent'
                ? roundMoney((calculation.lineTotal * value) / 100)
                : value * item.quantity;
          }
          await saleItemRepo.save(item);
          lineCalcs.push(calculation);
        }
        // `sale.items` todavía apunta a las líneas viejas. Cuando cambia una
        // cantidad esas filas ya se borraron, y como la relación tiene
        // `cascade: true`, el `save(sale)` del final las volvía a insertar
        // sin su `sale_id` y la edición moría con «Falta un dato obligatorio
        // (sale_id)». La venta en memoria tiene que reflejar lo que quedó en
        // la base.
        sale.items = editedItems;

        const totals = this.taxService.calculateSaleTotals(lineCalcs);
        sale.subtotal = totals.subtotal;
        sale.taxAmount = totals.taxAmount;
        sale.discountAmount = totals.discountAmount;
        sale.total = totals.total;
      } else if (dto.total !== undefined) {
        // Las facturas históricas importadas no tienen líneas. Se escala su
        // composición para conservar subtotal/descuento/IVA como snapshots.
        if (originalTotal > 0) {
          const factor = dto.total / originalTotal;
          sale.subtotal = roundMoney(Number(sale.subtotal) * factor);
          sale.discountAmount = roundMoney(
            Number(sale.discountAmount) * factor,
          );
          sale.taxAmount = roundMoney(Number(sale.taxAmount) * factor);
        } else {
          sale.subtotal = dto.total;
          sale.discountAmount = 0;
          sale.taxAmount = 0;
        }
        sale.total = dto.total;
      } else if (dto.discountAmount !== undefined) {
        const subtotal = Number(sale.subtotal);
        const tax = Number(sale.taxAmount);
        if (dto.discountAmount > subtotal + 0.01) {
          throw new BadRequestException(
            'El descuento no puede superar el subtotal de la venta',
          );
        }
        sale.discountAmount = dto.discountAmount;
        sale.total = Math.max(0, subtotal - dto.discountAmount + tax);
      }

      // Reconciliar las relaciones monetarias. En crédito, los pagos normales
      // se conservan y la diferencia pertenece a cartera. Sin crédito, los
      // pagos se escalan proporcionalmente al total corregido.
      const accounts = sale.accountsReceivable || [];
      if (accounts.length > 1) {
        throw new BadRequestException(
          'La venta tiene más de una cuenta por cobrar y requiere revisión manual',
        );
      }
      const payments = sale.payments || [];
      const paymentTotal = payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );
      if (accounts.length === 1) {
        const account = accounts[0];
        const creditTotal = roundMoney(Number(sale.total) - paymentTotal);
        const paidAmount = Number(account.paidAmount);
        if (creditTotal < -0.01) {
          throw new BadRequestException(
            'El nuevo total no puede ser menor que los pagos ya registrados',
          );
        }
        if (creditTotal + 0.01 < paidAmount) {
          throw new BadRequestException(
            `El nuevo saldo a crédito no puede ser menor que lo ya abonado ($${paidAmount.toLocaleString('es-CO')})`,
          );
        }
        account.totalAmount = Math.max(0, creditTotal);
        if (dto.clientId) account.clientId = dto.clientId;
        const fullyPaid = paidAmount + 0.01 >= Number(account.totalAmount);
        account.isFullyPaid = fullyPaid;
        account.fullyPaidAt = fullyPaid
          ? account.fullyPaidAt || new Date()
          : (null as unknown as Date);
        await manager.getRepository(AccountsReceivable).save(account);
      } else if (
        payments.length > 0 &&
        Math.abs(originalTotal - Number(sale.total)) > 0.01
      ) {
        const paymentRepo = manager.getRepository(Payment);
        let allocated = 0;
        for (let index = 0; index < payments.length; index++) {
          const payment = payments[index];
          const amount =
            index === payments.length - 1
              ? roundMoney(Number(sale.total) - allocated)
              : roundMoney(
                  paymentTotal > 0
                    ? (Number(sale.total) * Number(payment.amount)) /
                        paymentTotal
                    : 0,
                );
          allocated += amount;
          payment.amount = amount;
          if (payment.method === PaymentMethod.EFECTIVO) {
            payment.receivedAmount = Math.max(
              amount,
              Number(payment.receivedAmount),
            );
            payment.changeAmount = roundMoney(
              Number(payment.receivedAmount) - amount,
            );
          } else {
            payment.receivedAmount = amount;
            payment.changeAmount = 0;
          }
          await paymentRepo.save(payment);
        }
      }

      await saleRepo.save(sale);
    });
    return this.findOne(id, tenantId);
  }

  async getReceipt(id: string, tenantId: string): Promise<ReceiptData> {
    const sale = await this.findOne(id, tenantId);
    return this.receiptService.generateReceipt(sale);
  }

  // Marca como pagada una venta pendiente (no-crédito), registrando el pago
  // (método, banco, recibo, foto). Suma el total al banco vía Payment.bankId.
  async markSalePaid(
    id: string,
    dto: {
      method?: PaymentMethod;
      bankId?: string;
      reference?: string;
      receiptImageUrl?: string;
    },
    tenantId: string,
  ): Promise<Sale> {
    await this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const sale = await saleRepo.findOne({ where: { id, tenantId } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException('La venta no está activa');
      }
      if (sale.isPaid) {
        throw new BadRequestException('La venta ya está pagada');
      }

      // Si quien confirma no dice el método, vale el que se eligió al vender.
      // Sin esto había que responder dos veces la misma pregunta, y la segunda
      // respuesta —tomada de un desplegable con «Efectivo» arriba— podía
      // contradecir a la primera sin que nadie lo notara.
      const method =
        dto.method ?? sale.intendedPaymentMethod ?? PaymentMethod.EFECTIVO;
      if (method === PaymentMethod.CREDITO) {
        throw new BadRequestException('Método de pago inválido');
      }
      // Se comprueba con el método ya resuelto, no con el del DTO: quien
      // confirma puede no mandarlo, y entonces vale el que se eligió al
      // vender —que es justo el caso de la transferencia sin foto—.
      await this.caja.exigirComprobante(
        tenantId,
        [{ method, receiptImageUrl: dto.receiptImageUrl }],
        manager,
      );

      const total = Number(sale.total);
      await manager.getRepository(Payment).save(
        manager.getRepository(Payment).create({
          saleId: sale.id,
          method,
          amount: total,
          reference: dto.reference,
          bankId: dto.bankId ?? null,
          receiptImageUrl: dto.receiptImageUrl,
          receivedAmount: total,
          changeAmount: 0,
          tenantId,
        }),
      );

      sale.isPaid = true;
      // Ya no es una intención: el método vive en la fila de `payments`.
      sale.intendedPaymentMethod = null;
      await saleRepo.save(sale);
    });
    // Leer fuera de la transacción para devolver el estado ya confirmado.
    return this.findOne(id, tenantId);
  }

  /**
   * Cuánto sigue descontado por esta venta, por variante y bodega.
   *
   * Es el **neto**, no cada movimiento suelto, porque editar una factura deja
   * traza: el descuento original, la devolución por edición y el descuento
   * nuevo conviven en el historial. Sumar los descuentos por separado
   * repondría de más —y una factura editada dos veces repondría el doble—.
   */
  private async netoDescontado(
    manager: EntityManager,
    saleId: string,
    tenantId: string,
  ): Promise<{ variantId: string; warehouseId: string; neto: number }[]> {
    const filas: {
      variant_id: string;
      warehouse_id: string;
      neto: string;
    }[] = await manager.query(
      `SELECT variant_id, warehouse_id, SUM(quantity) AS neto
         FROM stock_movements m
        WHERE m.tenant_id = $2
          AND (
            (m.reference_id = $1 AND m.reference_type IN ('SALE', 'SALE_EDIT'))
            -- Las devoluciones cuelgan del id de la devolución, no del de la
            -- venta, pero devuelven mercancía de **esta** venta. Sin contarlas,
            -- anular una factura con una devolución parcial repone otra vez lo
            -- que el cliente ya había traído: el inventario termina con más
            -- pares de los que salieron.
            OR (
              m.reference_type = 'RETURN'
              AND m.reference_id IN (
                SELECT r.id::text FROM returns r
                 WHERE r.sale_id = $1::uuid AND r.tenant_id = $2
              )
            )
          )
        GROUP BY variant_id, warehouse_id
       HAVING SUM(quantity) <> 0`,
      [saleId, tenantId],
    );
    return filas.map((f) => ({
      variantId: f.variant_id,
      warehouseId: f.warehouse_id,
      neto: Number(f.neto),
    }));
  }

  /**
   * Qué bultos se llevó esta venta, agrupados por variante y bodega.
   *
   * Hay dos fuentes y hacen falta las dos. La de siempre es el
   * `stockUnitId` de la línea: existe cuando el cajero escaneó el par. La otra
   * son los eventos que deja el ledger, que cubre el caso más común —vender
   * desde el buscador— donde nadie escaneó nada y los pares se eligieron por
   * antigüedad; sin ella, anular esa venta repone la existencia pero deja los
   * pares marcados como vendidos.
   *
   * Solo entran los que siguen VENDIDOS: si ya volvieron por una devolución,
   * reponerlos otra vez los duplicaría.
   */
  private async unidadesDeLaVenta(
    manager: EntityManager,
    sale: Sale,
    tenantId: string,
  ): Promise<Map<string, string[]>> {
    // La pregunta «¿de quién es este bulto?» vive en el ledger: también la
    // hace la devolución, y tenerla en dos sitios era garantía de que una de
    // las dos copias se quedara sin el arreglo de la otra.
    const unidades = await this.ledger.unidadesDeLaReferencia(
      manager,
      sale.id,
      tenantId,
      {
        // Lo que la línea anotó al escanear: puede ser anterior a que el
        // ledger dejara eventos.
        extra: (sale.items ?? [])
          .map((item) => item.stockUnitId)
          .filter((id): id is string => !!id),
      },
    );
    if (unidades.length === 0) return new Map();

    const porPunto = new Map<string, string[]>();
    for (const unidad of unidades) {
      const clave = `${unidad.variantId}|${unidad.warehouseId}`;
      const lista = porPunto.get(clave);
      if (lista) lista.push(unidad.id);
      else porPunto.set(clave, [unidad.id]);
    }
    return porPunto;
  }

  /**
   * Devuelve a disponible los códigos que quedaron sueltos.
   *
   * Un bulto puede seguir vendido en un punto (variante y bodega) que no tiene
   * nada que reponer en el agregado. Pasa con las ventas viejas: la cascada
   * descontaba de la bodega de la venta aunque el par escaneado estuviera en
   * otra, así que el movimiento quedó en una bodega y el código en otra.
   *
   * Liberarlo no descuadra nada —al contrario: la bodega del par nunca vio el
   * descuento, y el par marcado como vendido era justo el faltante—. Y sin
   * esto el código se queda VENDIDO para siempre: no se puede volver a vender
   * ni a escanear.
   */
  private async liberarSobrantes(
    manager: EntityManager,
    sobrantes: Map<string, string[]>,
    motivo: 'SALE_CANCEL' | 'SALE_EDIT',
    sale: Sale,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    for (const [clave, ids] of sobrantes) {
      const [variantId, warehouseId] = clave.split('|');
      await this.ledger.mover(manager, {
        variantId,
        warehouseId,
        cantidad: 0,
        motivo,
        referenciaId: sale.id,
        notas: `Venta ${sale.saleNumber}: se liberan los códigos`,
        usuarioId: userId,
        unidades: ids,
        tenantId,
      });
    }
    sobrantes.clear();
  }

  async cancelSale(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<Sale> {
    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);

      // Se bloquea la fila madre con SQL directo: pedir FOR UPDATE por TypeORM
      // junto con las relaciones intentaría bloquear el lado nullable de los
      // LEFT JOIN y PostgreSQL lo rechaza.
      await this.lockSaleRow(manager, id, tenantId);
      const sale = await saleRepo.findOne({
        where: { id, tenantId },
        relations: ['items', 'accountsReceivable'],
      });

      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException(
          'Solo se pueden cancelar ventas completadas',
        );
      }

      // Cartera: una venta anulada no puede seguir cobrándose. Si ya recibió
      // abonos, la plata existe y hay que decidirla a mano (devolverla o
      // trasladarla), así que se rechaza en vez de borrar el rastro.
      const receivables = sale.accountsReceivable ?? [];
      const abonada = receivables.find(
        (account) => Number(account.paidAmount) > 0,
      );
      if (abonada) {
        throw new BadRequestException(
          `Esta venta a crédito ya tiene abonos por $${Number(
            abonada.paidAmount,
          ).toLocaleString('es-CO')}. Reversa los abonos antes de anularla.`,
        );
      }

      // Cuánto queda descontado por esta venta, por variante y bodega.
      //
      // Se lee el **neto** y no cada movimiento suelto porque editar una
      // factura deja traza: el descuento original, la devolución por edición y
      // el descuento nuevo conviven en el historial. Reponer movimiento por
      // movimiento devolvería de más justo en las ventas que alguien corrigió.
      const netoPorPunto = await this.netoDescontado(
        manager,
        sale.id,
        tenantId,
      );

      // Los códigos físicos que la venta se llevó, agrupados por variante y
      // bodega, para devolverlos en el mismo movimiento que repone el
      // agregado. Antes eran dos pasos sueltos y solo se devolvían los bultos
      // escaneados: si la venta salió del buscador, el ledger eligió pares por
      // antigüedad y esos quedaban VENDIDOS para siempre —el agregado volvía a
      // cuadrar en total, pero esos pares concretos ya no se podían escanear—.
      const unidadesVendidas = await this.unidadesDeLaVenta(
        manager,
        sale,
        tenantId,
      );

      for (const punto of netoPorPunto) {
        const clave = `${punto.variantId}|${punto.warehouseId}`;
        await this.ledger.mover(manager, {
          variantId: punto.variantId,
          warehouseId: punto.warehouseId,
          // El neto de una venta es negativo: reponer es cambiarle el signo.
          cantidad: -punto.neto,
          motivo: 'SALE_CANCEL',
          referenciaId: sale.id,
          notas: `Cancelación venta ${sale.saleNumber}`,
          usuarioId: userId,
          unidades: unidadesVendidas.get(clave),
          tenantId,
        });
        unidadesVendidas.delete(clave);
      }

      await this.liberarSobrantes(
        manager,
        unidadesVendidas,
        'SALE_CANCEL',
        sale,
        userId,
        tenantId,
      );

      // Cartera sin abonos: se salda en cero para que no siga apareciendo como
      // deuda del cliente (la fila queda, con su nota, para la auditoría).
      const arRepo = manager.getRepository(AccountsReceivable);
      for (const account of receivables) {
        account.totalAmount = 0;
        account.isFullyPaid = true;
        account.fullyPaidAt = new Date();
        account.notes = [
          account.notes,
          `Anulada con la venta ${sale.saleNumber}`,
        ]
          .filter(Boolean)
          .join(' · ');
        await arRepo.save(account);
      }

      sale.status = SaleStatus.CANCELLED;
      await saleRepo.save(sale);

      return this.findOne(id, tenantId);
    });
  }

  async getDailySummary(
    warehouseId: string | undefined,
    tenantId: string,
  ): Promise<{
    totalSales: number;
    totalAmount: number;
    totalItems: number;
    byPaymentMethod: Record<string, number>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const qb = this.saleRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.items', 'items')
      .leftJoinAndSelect('s.payments', 'payments')
      .leftJoinAndSelect('s.accountsReceivable', 'ar')
      .where('s.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('s.created_at >= :today', { today: today.toISOString() })
      .andWhere('s.tenant_id = :tenantId', { tenantId });

    if (warehouseId) {
      qb.andWhere('s.warehouse_id = :wid', { wid: warehouseId });
    }

    const sales = await qb.getMany();

    const totalSales = sales.length;
    const totalAmount = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalItems = sales.reduce(
      (sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.quantity, 0),
      0,
    );

    const byPaymentMethod: Record<string, number> = {};
    for (const sale of sales) {
      for (const payment of sale.payments) {
        byPaymentMethod[payment.method] =
          (byPaymentMethod[payment.method] || 0) + Number(payment.amount);
      }
      if (sale.accountsReceivable) {
        for (const ar of sale.accountsReceivable) {
          byPaymentMethod['CREDITO'] =
            (byPaymentMethod['CREDITO'] || 0) + Number(ar.totalAmount);
        }
      }
    }

    return { totalSales, totalAmount, totalItems, byPaymentMethod };
  }

  // ─── Accounts Receivable ───

  async findAllAccountsReceivable(
    filters:
      | {
          isFullyPaid?: boolean;
          clientId?: string;
        }
      | undefined,
    tenantId: string,
  ): Promise<AccountsReceivable[]> {
    const where: Record<string, unknown> = {
      tenantId,
      // Una venta anulada no debe seguir figurando en cartera.
      sale: { status: Not(SaleStatus.CANCELLED) },
    };
    if (filters?.isFullyPaid !== undefined)
      where.isFullyPaid = filters.isFullyPaid;
    if (filters?.clientId) where.clientId = filters.clientId;

    return this.arRepository.find({
      where,
      relations: ['sale', 'client', 'payments'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOneAccountReceivable(
    id: string,
    tenantId: string,
  ): Promise<AccountsReceivable> {
    const ar = await this.arRepository.findOne({
      where: { id, tenantId },
      relations: ['sale', 'client', 'payments'],
    });
    if (!ar) {
      throw new NotFoundException('Cuenta por cobrar no encontrada');
    }
    return ar;
  }

  async recordArPayment(
    arId: string,
    dto: RecordArPaymentDto,
    tenantId: string,
    // Quién está cobrando. El cuadre del día pregunta por vendedor, y quien
    // recibe el abono no tiene por qué ser quien vendió meses atrás.
    cobradoPor?: string,
  ): Promise<AccountsReceivable> {
    await this.caja.exigirComprobante(tenantId, [dto]);
    return this.dataSource.transaction(async (manager) => {
      const arRepo = manager.getRepository(AccountsReceivable);
      const arPayRepo = manager.getRepository(AccountsReceivablePayment);

      const ar = await arRepo
        .createQueryBuilder('ar')
        .setLock('pessimistic_write')
        .where('ar.id = :arId', { arId })
        .andWhere('ar.tenantId = :tenantId', { tenantId })
        .getOne();
      if (!ar) {
        throw new NotFoundException('Cuenta por cobrar no encontrada');
      }
      if (ar.isFullyPaid) {
        throw new BadRequestException(
          'Esta cuenta ya está completamente pagada',
        );
      }
      const sale = await manager.getRepository(Sale).findOne({
        where: { id: ar.saleId, tenantId },
      });
      if (sale?.status === SaleStatus.CANCELLED) {
        throw new BadRequestException(
          `La venta ${sale.saleNumber} está anulada: su cartera ya no se cobra.`,
        );
      }

      const toCents = (value: number) => Math.round(Number(value) * 100);
      const amountCents = toCents(dto.amount);
      const pendingCents = toCents(ar.totalAmount) - toCents(ar.paidAmount);
      if (amountCents > pendingCents) {
        throw new BadRequestException(
          `El monto ($${dto.amount}) excede el saldo pendiente ($${(pendingCents / 100).toFixed(2)})`,
        );
      }

      // Create payment record
      const payment = arPayRepo.create({
        accountReceivableId: arId,
        amount: amountCents / 100,
        method: dto.method,
        reference: dto.reference,
        bankId: dto.bankId ?? null,
        receiptImageUrl: dto.receiptImageUrl,
        notes: dto.notes,
        userId: cobradoPor ?? null,
        tenantId,
      });
      await arPayRepo.save(payment);

      // Update totals (use update() to avoid TypeORM cascade issues with loaded relations)
      const newPaidAmountCents = toCents(ar.paidAmount) + amountCents;
      const newPaidAmount = newPaidAmountCents / 100;
      const isFullyPaid = newPaidAmountCents >= toCents(ar.totalAmount);
      await arRepo.update(
        { id: arId, tenantId },
        {
          paidAmount: newPaidAmount,
          ...(isFullyPaid
            ? { isFullyPaid: true, fullyPaidAt: new Date() }
            : {}),
        },
      );

      // Return with relations
      const updated = await arRepo.findOne({
        where: { id: arId, tenantId },
        relations: ['sale', 'client', 'payments'],
      });
      return updated!;
    });
  }

  /**
   * Registra un abono al saldo total del cliente y lo aplica FIFO: primero la
   * venta a crédito más antigua, luego la siguiente y así sucesivamente. Cada
   * aplicación conserva su propia fila contable y comparte un batch auditable.
   */
  /**
   * Cobra **varias deudas escogidas a mano** en un solo pago.
   *
   * Un local debe diez pares de días distintos. Cobrarlos de a uno obligaba a
   * entrar día por día y registrar venta por venta: «a veces se demoraba
   * mucho». Aquí se marcan las que se están pagando y se cobra una vez.
   *
   * Se diferencia del abono por saldo del cliente en que **quien cobra elige**
   * qué cuentas entran: puede estar saldando tres de las diez, o cuentas de un
   * local que además le compra a título personal. Por eso no exige el ajuste
   * de aplicación automática: escoger las cuentas ya es la instrucción.
   */
  /**
   * Aplica un abono sobre un grupo de cuentas ya elegidas y bloqueadas.
   *
   * El corazón lo hace `repartirAbono`, que vive aparte porque es aritmética
   * de plata y se prueba sola. Aquí queda lo que necesita base de datos:
   * validar que no se cobre de más, escribir cada aplicación con su fila
   * contable y dejarlas atadas por un mismo lote para poder auditarlas juntas.
   */
  private async aplicarAbono(
    manager: EntityManager,
    cuentas: AccountsReceivable[],
    dto: RecordArPaymentDto,
    tenantId: string,
    cobradoPor?: string,
    descartadas = 0,
  ): Promise<{
    batchId: string;
    amount: number;
    allocations: {
      accountReceivableId: string;
      saleId: string;
      saleNumber: string;
      invoiceNumber: string | null;
      amount: number;
      remainingBalance: number;
      isFullyPaid: boolean;
    }[];
  }> {
    const aCentavos = (valor: number) => Math.round(Number(valor) * 100);
    const enCentavos = cuentas.map((cuenta) => ({
      id: cuenta.id,
      totalCents: aCentavos(cuenta.totalAmount),
      paidCents: aCentavos(cuenta.paidAmount),
    }));
    const abonoCents = aCentavos(dto.amount);
    const pendienteCents = pendienteTotal(enCentavos);

    if (pendienteCents <= 0) {
      throw new BadRequestException('No hay saldo pendiente que cobrar.');
    }
    if (abonoCents > pendienteCents) {
      throw new BadRequestException(
        `El monto ($${dto.amount}) excede el saldo pendiente ` +
          `($${(pendienteCents / 100).toFixed(2)})` +
          (descartadas > 0
            ? `. Se descartaron ${descartadas} cuenta(s) ya pagadas o anuladas.`
            : '.'),
      );
    }

    const batchId = randomUUID();
    const porId = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));
    const arRepo = manager.getRepository(AccountsReceivable);
    const pagoRepo = manager.getRepository(AccountsReceivablePayment);
    const allocations: {
      accountReceivableId: string;
      saleId: string;
      saleNumber: string;
      invoiceNumber: string | null;
      amount: number;
      remainingBalance: number;
      isFullyPaid: boolean;
    }[] = [];

    for (const aplicacion of repartirAbono(enCentavos, abonoCents)) {
      const cuenta = porId.get(aplicacion.cuentaId)!;
      const pagadoCents = aCentavos(cuenta.paidAmount) + aplicacion.centavos;
      const totalCents = aCentavos(cuenta.totalAmount);

      await pagoRepo.save(
        pagoRepo.create({
          accountReceivableId: cuenta.id,
          amount: aplicacion.centavos / 100,
          method: dto.method,
          reference: dto.reference,
          bankId: dto.bankId ?? null,
          receiptImageUrl: dto.receiptImageUrl,
          notes: dto.notes,
          allocationBatchId: batchId,
          userId: cobradoPor ?? null,
          tenantId,
        }),
      );
      await arRepo.update(
        { id: cuenta.id, tenantId },
        {
          paidAmount: pagadoCents / 100,
          isFullyPaid: aplicacion.quedaSaldada,
          fullyPaidAt: aplicacion.quedaSaldada ? new Date() : null,
        },
      );

      allocations.push({
        accountReceivableId: cuenta.id,
        saleId: cuenta.saleId,
        saleNumber: cuenta.sale.saleNumber,
        invoiceNumber: cuenta.sale.invoiceNumber ?? null,
        amount: aplicacion.centavos / 100,
        remainingBalance: Math.max(0, totalCents - pagadoCents) / 100,
        isFullyPaid: aplicacion.quedaSaldada,
      });
    }

    return { batchId, amount: abonoCents / 100, allocations };
  }

  async collectAccountsReceivable(
    accountIds: string[],
    dto: RecordArPaymentDto,
    tenantId: string,
    cobradoPor?: string,
  ): Promise<{
    batchId: string;
    amount: number;
    allocations: {
      accountReceivableId: string;
      saleId: string;
      saleNumber: string;
      invoiceNumber: string | null;
      amount: number;
      remainingBalance: number;
      isFullyPaid: boolean;
    }[];
  }> {
    await this.caja.exigirComprobante(tenantId, [dto]);
    const ids = [...new Set(accountIds)];
    if (!ids.length) {
      throw new BadRequestException('No se eligió ninguna cuenta por cobrar.');
    }
    return this.dataSource.transaction(async (manager) => {
      const abiertas = await manager
        .getRepository(AccountsReceivable)
        .createQueryBuilder('ar')
        .innerJoinAndSelect('ar.sale', 'sale')
        .setLock('pessimistic_write', undefined, ['ar'])
        .where('ar.id IN (:...ids)', { ids })
        .andWhere('ar.tenantId = :tenantId', { tenantId })
        .andWhere('ar.isFullyPaid = false')
        // Una venta anulada ya no se cobra.
        //
        // Hoy es un cinturón sobre tirantes: anular deja la cuenta en cero y
        // marcada como saldada, así que el filtro de arriba ya la descarta. Se
        // deja porque el día que anular cambie —o aparezca cartera vieja
        // anulada a mano— la diferencia es cobrarle a alguien una factura que
        // no existe.
        .andWhere('sale.status <> :cancelled', {
          cancelled: SaleStatus.CANCELLED,
        })
        // De la más vieja a la más nueva: es como se cobra en la calle.
        .orderBy('sale.createdAt', 'ASC')
        .addOrderBy('ar.createdAt', 'ASC')
        .addOrderBy('ar.id', 'ASC')
        .getMany();

      if (!abiertas.length) {
        throw new BadRequestException(
          'Ninguna de las cuentas elegidas tiene saldo por cobrar. ' +
            'Puede que ya las hayan pagado o que su factura esté anulada.',
        );
      }
      // Se dice cuáles se cayeron en vez de cobrar en silencio de menos: quien
      // cobra tiene el dinero en la mano y necesita saber a qué se aplicó.
      const descartadas = ids.length - abiertas.length;
      return this.aplicarAbono(
        manager,
        abiertas,
        dto,
        tenantId,
        cobradoPor,
        descartadas,
      );
    });
  }

  async recordClientBalancePayment(
    clientId: string,
    dto: RecordArPaymentDto,
    tenantId: string,
    cobradoPor?: string,
  ): Promise<{
    batchId: string;
    amount: number;
    allocations: {
      accountReceivableId: string;
      saleId: string;
      saleNumber: string;
      invoiceNumber: string | null;
      amount: number;
      remainingBalance: number;
      isFullyPaid: boolean;
    }[];
  }> {
    await this.caja.exigirComprobante(tenantId, [dto]);
    return this.dataSource.transaction(async (manager) => {
      const settings = await manager.getRepository(StoreSettings).findOne({
        where: { tenantId },
      });
      if (settings?.arPaymentAllocationMode !== 'FIFO') {
        throw new BadRequestException(
          'La aplicación automática FIFO no está habilitada para esta tienda.',
        );
      }

      const client = await manager.getRepository(Client).findOne({
        where: { id: clientId, tenantId },
      });
      if (!client) throw new NotFoundException('Cliente no encontrado');

      const arRepo = manager.getRepository(AccountsReceivable);
      const openAccounts = await arRepo
        .createQueryBuilder('ar')
        .innerJoinAndSelect('ar.sale', 'sale')
        .setLock('pessimistic_write', undefined, ['ar'])
        .where('ar.clientId = :clientId', { clientId })
        .andWhere('ar.tenantId = :tenantId', { tenantId })
        .andWhere('ar.isFullyPaid = false')
        // Nunca abonar a la cartera de una venta anulada.
        .andWhere('sale.status <> :cancelled', {
          cancelled: SaleStatus.CANCELLED,
        })
        .orderBy('sale.createdAt', 'ASC')
        .addOrderBy('ar.createdAt', 'ASC')
        .addOrderBy('ar.id', 'ASC')
        .getMany();

      if (!openAccounts.length) {
        throw new BadRequestException('El cliente no tiene saldo pendiente.');
      }
      // El mismo reparto que usa el cobro por selección: una sola aritmética,
      // para que un arreglo en una no deje la otra atrás.
      return this.aplicarAbono(
        manager,
        openAccounts,
        dto,
        tenantId,
        cobradoPor,
      );
    });
  }

  async getClientAccountSummary(
    clientId: string,
    tenantId: string,
  ): Promise<{
    totalCredit: number;
    totalPaid: number;
    totalPending: number;
    activeAccounts: number;
  }> {
    const accounts = await this.arRepository.find({
      where: { clientId, tenantId },
    });

    const totalCredit = accounts.reduce(
      (sum, a) => sum + Number(a.totalAmount),
      0,
    );
    const totalPaid = accounts.reduce(
      (sum, a) => sum + Number(a.paidAmount),
      0,
    );

    return {
      totalCredit,
      totalPaid,
      totalPending: totalCredit - totalPaid,
      activeAccounts: accounts.filter((a) => !a.isFullyPaid).length,
    };
  }

  /**
   * Estado de cuenta de un cliente: sus ventas a crédito (facturas) con lo que
   * compró, cuánto ha abonado y cuánto debe. Reúne en una sola vista lo que
   * antes obligaba a cruzar Ventas ↔ Cuentas por Cobrar. Genérico para todos
   * los tenants.
   */
  async getClientStatement(clientId: string, tenantId: string) {
    const accounts = await this.arRepository.find({
      // Sin las ventas anuladas: su cartera se saldó al anularlas y mostrarla
      // aquí inflaría la deuda histórica del cliente.
      where: {
        clientId,
        tenantId,
        sale: { status: Not(SaleStatus.CANCELLED) },
      },
      relations: ['sale', 'sale.items', 'client', 'payments'],
      order: { createdAt: 'DESC' },
    });

    let totalCredit = 0;
    let totalPaid = 0;
    let totalDebt = 0;

    const client = accounts[0]?.client;

    const invoices = accounts.map((ar) => {
      const total = Number(ar.totalAmount);
      const paid = Number(ar.paidAmount);
      const balance = Math.max(0, total - paid);
      const paymentStatus =
        ar.isFullyPaid || balance <= 0
          ? 'PAID'
          : paid > 0
            ? 'PARTIAL'
            : 'PENDING';

      totalCredit += total;
      totalPaid += paid;
      totalDebt += balance;

      return {
        id: ar.id,
        saleId: ar.saleId,
        invoiceNumber: ar.sale?.invoiceNumber ?? ar.sale?.saleNumber ?? null,
        date: ar.createdAt,
        dueDate: ar.dueDate ?? null,
        subtotal: ar.sale ? Number(ar.sale.subtotal) : total,
        discountAmount: ar.sale ? Number(ar.sale.discountAmount) : 0,
        taxAmount: ar.sale ? Number(ar.sale.taxAmount) : 0,
        total,
        paidAmount: paid,
        balance,
        paymentStatus,
        items: (ar.sale?.items || []).map((it) => ({
          name: it.productName,
          size: it.variantSize ?? '',
          color: it.variantColor ?? '',
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          lineTotal: it.quantity * Number(it.unitPrice),
        })),
      };
    });

    return {
      client: client
        ? {
            id: client.id,
            name: `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(),
            documentNumber: client.documentNumber ?? null,
            phone: client.phone ?? null,
            email: client.email ?? null,
            address: client.address ?? null,
          }
        : null,
      invoices,
      totals: { totalCredit, totalPaid, totalDebt },
    };
  }
}

/**
 * Un instante de la petición, o `undefined` si no vino o no se entiende.
 *
 * La pantalla manda ISO con huso (`2026-08-18T00:00:00-05:00`) porque es la
 * única que sabe en qué huso está la tienda; el servidor corre en UTC. Una
 * fecha pelada se acepta por compatibilidad y se lee como UTC.
 */
function parseInstant(valor?: string): Date | undefined {
  if (!valor?.trim()) return undefined;
  const fecha = new Date(valor.trim());
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}
