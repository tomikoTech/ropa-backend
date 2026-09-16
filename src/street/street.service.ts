import {
  aplicarRecepcion,
  deltasDesdeTotales,
  todoRecibido,
  validarRecepcion,
  type LineaDeRecepcion,
} from './recepcion-de-cesion.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StreetSeller } from './entities/street-seller.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import {
  StreetDispatch,
  StreetDispatchStatus,
} from './entities/street-dispatch.entity.js';
import { StreetDispatchItem } from './entities/street-dispatch-item.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from '../inventory/entities/stock-unit.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from '../inventory/entities/stock-unit-event.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Payment } from '../pos/entities/payment.entity.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { SaleChannel } from '../common/enums/sale-channel.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';
import { InvoiceService } from '../pos/services/invoice.service.js';
import { StockLedgerService } from '../inventory/ledger/stock-ledger.service.js';
import {
  buildSellerCode,
  settlementSummary,
  type SettlementLine,
} from './street-settlement.js';
import {
  resolveRange,
  timestampRangeSql,
} from '../reports/engine/report-filters.js';
import {
  resumenPorPatinador,
  type DespachoDeReporte,
} from './street-reporte.js';
import { nombreDelDestino, resolverDestino } from './destino-de-la-cesion.js';
import type {
  CreateDispatchDto,
  CreateStreetSellerDto,
  SettleDispatchDto,
  UpdateStreetSellerDto,
} from './dto/street.dto.js';

/** Marca de los movimientos de inventario que genera la calle. */
const REF_DISPATCH = 'STREET_DISPATCH';

/** Estados que aún permiten operar sobre una remisión. */
const OPERABLE = StreetDispatchStatus.OPEN;

@Injectable()
export class StreetService {
  constructor(
    @InjectRepository(StreetSeller)
    private readonly sellerRepo: Repository<StreetSeller>,
    @InjectRepository(StreetDispatch)
    private readonly dispatchRepo: Repository<StreetDispatch>,
    @InjectRepository(StreetDispatchItem)
    private readonly itemRepo: Repository<StreetDispatchItem>,
    private readonly dataSource: DataSource,
    private readonly invoiceService: InvoiceService,
    private readonly ledger: StockLedgerService,
  ) {}

  // ── Patinadores ──────────────────────────────────────────────────────────

  listSellers(tenantId: string, includeInactive = false) {
    return this.sellerRepo.find({
      where: includeInactive ? { tenantId } : { tenantId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async createSeller(dto: CreateStreetSellerDto, tenantId: string) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El patinador necesita un nombre');

    // El código se genera solo: en el sistema anterior el patinador podía
    // quedar sin código y entonces no se le podía despachar nada.
    return retryOnUniqueViolation(async () => {
      const row = await this.sellerRepo
        .createQueryBuilder('s')
        .select(
          "MAX(CAST(substring(s.code FROM '^77(\\d{6})') AS integer))",
          'max',
        )
        .where('s.tenant_id = :tenantId', { tenantId })
        .getRawOne<{ max: string | null }>();

      return this.sellerRepo.save(
        this.sellerRepo.create({
          name,
          code: buildSellerCode(Number(row?.max ?? 0) + 1),
          documentNumber: dto.documentNumber?.trim() || null,
          phone: dto.phone?.trim() || null,
          notes: dto.notes?.trim() || null,
          tenantId,
        }),
      );
    });
  }

  async updateSeller(id: string, dto: UpdateStreetSellerDto, tenantId: string) {
    const seller = await this.sellerRepo.findOne({ where: { id, tenantId } });
    if (!seller) throw new NotFoundException('El patinador no existe');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name)
        throw new BadRequestException('El patinador necesita un nombre');
      seller.name = name;
    }
    if (dto.documentNumber !== undefined) {
      seller.documentNumber = dto.documentNumber.trim() || null;
    }
    if (dto.phone !== undefined) seller.phone = dto.phone.trim() || null;
    if (dto.notes !== undefined) seller.notes = dto.notes.trim() || null;

    if (dto.isActive === false) {
      // Desactivar a alguien que tiene mercancía en la calle dejaría la remisión
      // sin poder cuadrarse.
      const abiertas = await this.dispatchRepo.count({
        where: {
          tenantId,
          streetSellerId: id,
          status: StreetDispatchStatus.OPEN,
        },
      });
      if (abiertas > 0) {
        throw new ConflictException(
          `${seller.name} tiene ${abiertas} remisión(es) sin cuadrar. ` +
            `Cuádralas antes de desactivarlo.`,
        );
      }
    }
    if (dto.isActive !== undefined) seller.isActive = dto.isActive;

    return this.sellerRepo.save(seller);
  }

  /**
   * Buscar por el código del carnet (lo que hace el lector al despachar).
   *
   * Si está inactivo lo dice: el sistema anterior devolvía un rechazo seco y
   * quien despachaba no sabía si el carnet estaba mal leído o el patinador
   * estaba dado de baja.
   */
  async findSellerByCode(code: string, tenantId: string) {
    const seller = await this.sellerRepo.findOne({
      where: { code: code.trim(), tenantId },
    });
    if (!seller) {
      throw new NotFoundException(
        `Ningún patinador tiene el carnet "${code.trim()}". ` +
          `Revisa la lectura o búscalo por nombre.`,
      );
    }
    if (!seller.isActive) {
      throw new BadRequestException(
        `${seller.name} está desactivado: no se le puede despachar mercancía. ` +
          `Actívalo si volvió a trabajar.`,
      );
    }
    return seller;
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  /**
   * Bloquea la remisión y confirma, ya dentro de la transacción, que sigue
   * abierta. Leer el estado antes de abrir la transacción no sirve: dos
   * peticiones simultáneas ven las dos `OPEN` y las dos siguen adelante.
   */
  private async lockDispatch(
    manager: EntityManager,
    id: string,
    tenantId: string,
  ): Promise<void> {
    const rows: { status: StreetDispatchStatus }[] = await manager.query(
      'SELECT status FROM street_dispatches WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('La remisión no existe');
    if (rows[0].status !== OPERABLE) {
      throw new ConflictException(
        `Otra persona acaba de ${
          rows[0].status === StreetDispatchStatus.SETTLED ? 'cuadrar' : 'anular'
        } esta remisión. Recarga la pantalla para ver cómo quedó.`,
      );
    }
  }

  /** El cliente al que se factura tiene que ser de esta tienda. */
  private async assertClient(clientId: string, tenantId: string) {
    const exists = await this.dataSource
      .getRepository(Client)
      .findOne({ where: { id: clientId, tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('El cliente no existe');
  }

  /** El banco del recaudo también. */
  private async assertBank(bankId: string, tenantId: string) {
    const exists = await this.dataSource
      .getRepository(Bank)
      .findOne({ where: { id: bankId, tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('El banco no existe');
  }

  // ── Despachar ────────────────────────────────────────────────────────────

  private async nextDispatchNumber(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string> {
    const row = await manager
      .getRepository(StreetDispatch)
      .createQueryBuilder('d')
      .select(
        "MAX(CAST(substring(d.dispatch_number FROM '^RRP-0*([0-9]+)$') AS integer))",
        'max',
      )
      .where('d.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    return `RRP-${String(Number(row?.max ?? 0) + 1).padStart(5, '0')}`;
  }

  /**
   * Entrega mercancía a un patinador.
   *
   * Todo en una transacción y **en una sola llamada**: el sistema anterior manda
   * el despacho en paquetes de 20 renglones por un límite de su cliente, y si un
   * paquete falla queda media remisión hecha.
   */
  async createDispatch(
    dto: CreateDispatchDto,
    userId: string,
    tenantId: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        'El despacho necesita al menos un producto',
      );
    }

    // A quién se le cede. La regla —exactamente un destino, y una bodega que no
    // se presta a sí misma— vive en `destino-de-la-cesion.ts` y se prueba sola.
    // Sin `destinoTipo` se asume `PERSONA`: es lo único que existía antes y así
    // lo que ya llamaba a esto sigue funcionando igual.
    const destino = resolverDestino({
      tipo: dto.destinoTipo ?? 'PERSONA',
      personaId: dto.streetSellerId,
      bodegaId: dto.destinoWarehouseId,
      bodegaOrigenId: dto.warehouseId,
    });
    if (destino.error) throw new BadRequestException(destino.error);

    let seller: StreetSeller | null = null;
    if (destino.tipo === 'PERSONA') {
      seller = await this.sellerRepo.findOne({
        where: { id: destino.personaId!, tenantId },
      });
      if (!seller) throw new NotFoundException('El patinador no existe');
      if (!seller.isActive) {
        throw new BadRequestException(
          `${seller.name} está desactivado: no se le puede despachar mercancía.`,
        );
      }
    }

    let bodegaDestino: Warehouse | null = null;
    if (destino.tipo === 'BODEGA') {
      bodegaDestino = await this.dataSource
        .getRepository(Warehouse)
        .findOne({ where: { id: destino.bodegaId!, tenantId } });
      if (!bodegaDestino) {
        throw new NotFoundException('La bodega de destino no existe');
      }
      if (!bodegaDestino.isActive) {
        throw new BadRequestException(
          `«${bodegaDestino.name}» está desactivada: no se le puede ceder mercancía.`,
        );
      }
    }

    const dispatchId = await retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (manager) => {
        const dispatch = await manager.getRepository(StreetDispatch).save(
          manager.getRepository(StreetDispatch).create({
            dispatchNumber: await this.nextDispatchNumber(manager, tenantId),
            destinoTipo: destino.tipo,
            streetSellerId: destino.personaId ?? null,
            destinoWarehouseId: destino.bodegaId ?? null,
            warehouseId: dto.warehouseId,
            createdById: userId,
            notes: dto.notes?.trim() || null,
            status: StreetDispatchStatus.OPEN,
            tenantId,
          }),
        );

        for (const line of dto.items) {
          const variant = await manager.getRepository(ProductVariant).findOne({
            where: { id: line.variantId, tenantId },
            relations: ['product'],
          });
          if (!variant) {
            throw new NotFoundException(
              `La referencia ${line.variantId} no existe`,
            );
          }

          // Con lock: sin él, dos despachos simultáneos de la misma referencia
          // leen el mismo disponible y el inventario queda en negativo.
          const stock = await manager.getRepository(Stock).findOne({
            where: {
              variantId: line.variantId,
              warehouseId: dto.warehouseId,
              tenantId,
            },
            lock: { mode: 'pessimistic_write' },
          });
          const disponible = Number(stock?.quantity ?? 0);
          if (disponible < line.quantity) {
            throw new BadRequestException(
              `No hay suficiente "${variant.product.name}" ` +
                `${variant.sizeName}/${variant.colorName} en esa bodega: ` +
                `hay ${disponible} y se están despachando ${line.quantity}.`,
            );
          }

          // Sale del inventario: está en la calle, no en la bodega. Los
          // códigos salen con él; antes se quedaban figurando disponibles y
          // alguien iba a buscar en la bodega un par que andaba en un carro.
          // El código escaneado es **el que sale**. Se valida antes de mover:
          // si se dejaba que el ledger eligiera por antigüedad, salía un par
          // distinto del que el patinador se llevaba, y quedaban dos bultos
          // fuera del inventario por una sola unidad de existencia.
          if (line.stockUnitId) {
            const unit = await manager.getRepository(StockUnit).findOne({
              where: { id: line.stockUnitId, tenantId },
            });
            if (!unit) throw new NotFoundException('El código no existe');
            if (unit.status !== StockUnitStatus.IN_STOCK) {
              throw new BadRequestException(
                `${unit.kind === StockUnitKind.BOX ? 'La caja' : 'El par'} ${unit.barcode} ya no está disponible.`,
              );
            }
          }

          // Sale del inventario: está en la calle, no en la bodega. Los
          // códigos salen con él; antes se quedaban figurando disponibles y
          // alguien iba a buscar en la bodega un par que andaba en un carro.
          await this.ledger.mover(manager, {
            variantId: line.variantId,
            warehouseId: dto.warehouseId,
            cantidad: -line.quantity,
            motivo: 'STREET',
            referenciaId: dispatch.id,
            notas: `Cesión ${dispatch.dispatchNumber} a ${nombreDelDestino({
              destinoTipo: destino.tipo,
              persona: seller,
              bodegaDestino,
            })}`,
            usuarioId: userId,
            unidades: line.stockUnitId ? [line.stockUnitId] : undefined,
            tenantId,
          });

          const precio =
            line.unitPrice ??
            Number(variant.priceOverride ?? variant.product.basePrice);

          await manager.getRepository(StreetDispatchItem).save(
            manager.getRepository(StreetDispatchItem).create({
              dispatchId: dispatch.id,
              variantId: variant.id,
              productName: variant.product.name,
              variantSku: variant.sku,
              // El código del escáner viaja con el despacho: el patinador sale
              // con la mercancía y el papel, y así se cuadra por código.
              variantBarcode: variant.barcode ?? null,
              variantSize: variant.sizeName,
              variantColor: variant.colorName,
              stockUnitId: line.stockUnitId ?? null,
              quantity: line.quantity,
              unitPrice: precio,
              // Snapshot del costo: la utilidad de la calle no debe cambiar
              // cuando cambie el costo del producto.
              unitCost: Number(variant.product.costPrice) || 0,
              tenantId,
            }),
          );
        }

        return dispatch.id;
      }),
    );

    return this.findDispatch(dispatchId, tenantId);
  }

  // ── Consultar ────────────────────────────────────────────────────────────

  async listDispatches(
    filters: {
      streetSellerId?: string;
      warehouseId?: string;
      status?: string;
    },
    tenantId: string,
  ) {
    const qb = this.dispatchRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.seller', 'seller')
      .leftJoinAndSelect('d.warehouse', 'warehouse')
      .leftJoinAndSelect('d.items', 'items')
      .where('d.tenant_id = :tenantId', { tenantId })
      .orderBy('d.created_at', 'DESC');

    if (filters.streetSellerId) {
      qb.andWhere('d.street_seller_id = :sid', { sid: filters.streetSellerId });
    }
    if (filters.warehouseId) {
      qb.andWhere('d.warehouse_id = :wid', { wid: filters.warehouseId });
    }
    if (filters.status) {
      qb.andWhere('d.status = :status', { status: filters.status });
    }

    const dispatches = await qb.getMany();
    return dispatches.map((d) => this.withSummary(d));
  }

  /**
   * Reporte **por destino**: cuánto salió, se vendió, se devolvió, sigue afuera
   * y cuánto se recaudó de cada uno en el periodo.
   *
   * El destino puede ser una persona o una bodega, y por eso se agrupa por
   * destino y no por patinador: la pregunta que responde es «qué me deben», y
   * da igual si quien debe es alguien o un local.
   *
   * El corte del día es en la zona del negocio (ver `timestampRangeSql`) y la
   * aritmética la hace una función pura y probada aparte, en centavos enteros.
   */
  async reportePorPatinador(
    filters: { from?: string; to?: string; warehouseId?: string },
    tenantId: string,
  ) {
    const range = resolveRange(filters.from, filters.to);
    const qb = this.dispatchRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.seller', 'seller')
      // El destino también puede ser una bodega: sin este join el reporte la
      // nombraba «Bodega» a secas y no se sabía cuál.
      .leftJoinAndSelect('d.bodegaDestino', 'bodegaDestino')
      .leftJoinAndSelect('d.items', 'items')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('d.created_at'), {
        from: range.from,
        to: range.to,
      });
    if (filters.warehouseId) {
      qb.andWhere('d.warehouse_id = :wid', { wid: filters.warehouseId });
    }
    const dispatches = await qb.getMany();

    const toCents = (v: number | string | null | undefined) =>
      Math.round(Number(v ?? 0) * 100);
    const entrada: DespachoDeReporte[] = dispatches.map((d) => ({
      // El destino puede ser una persona o una bodega. `?? d.id` y no una
      // cadena fija: agrupar todas las que no tengan destino bajo la misma
      // clave las sumaría como si fueran del mismo, y el reporte diría que
      // alguien debe lo que deben varios.
      destinoId: d.destinoWarehouseId ?? d.streetSellerId ?? d.id,
      destinoNombre: nombreDelDestino(d),
      status: d.status,
      collectedAmountCents:
        d.collectedAmount != null ? toCents(d.collectedAmount) : null,
      items: (d.items ?? []).map((it) => ({
        quantity: it.quantity,
        quantitySold: it.quantitySold,
        quantityReturned: it.quantityReturned,
        unitPriceCents: toCents(it.unitPrice),
        unitCostCents: toCents(it.unitCost),
      })),
    }));

    return {
      from: range.from,
      to: range.to,
      warnings: range.warnings,
      ...resumenPorPatinador(entrada),
    };
  }

  async findDispatch(id: string, tenantId: string) {
    const dispatch = await this.dispatchRepo.findOne({
      where: { id, tenantId },
      relations: ['seller', 'warehouse', 'items'],
    });
    if (!dispatch) throw new NotFoundException('La remisión no existe');
    return this.withSummary(dispatch);
  }

  /** La remisión con su cuadratura, que es lo que se mira siempre. */
  private withSummary(dispatch: StreetDispatch) {
    const cobrado =
      dispatch.collectedAmount === null ||
      dispatch.collectedAmount === undefined
        ? null
        : Number(dispatch.collectedAmount);
    const summary = settlementSummary(
      (dispatch.items ?? []).map((i) => ({
        id: i.id,
        productName: i.productName,
        variantSize: i.variantSize,
        variantColor: i.variantColor,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        unitCost: Number(i.unitCost),
        quantitySold: i.quantitySold,
        quantityReturned: i.quantityReturned,
      })),
    );
    return {
      ...dispatch,
      summary: {
        ...summary,
        /** Plata que entregó (null mientras la remisión siga abierta). */
        collected: cobrado,
        /** Plata que quedó debiendo por lo que sí vendió. */
        pendingCash:
          cobrado === null
            ? 0
            : Math.max(0, Math.round((summary.revenue - cobrado) * 100) / 100),
      },
    };
  }

  // ── Cuadrar ──────────────────────────────────────────────────────────────

  /**
   * Cuadrar de una vez: lo que se manda son **totales** (vendido y devuelto en
   * total por renglón) y la cesión se cierra; lo que no volvió queda como
   * faltante. Es la pantalla de siempre. Por dentro es una recepción más,
   * con la diferencia contra lo ya recibido, y cierre forzado.
   */
  async settle(
    id: string,
    dto: SettleDispatchDto,
    userId: string,
    tenantId: string,
  ) {
    return this.recibir(id, dto, userId, tenantId, {
      cerrar: true,
      totales: true,
    });
  }

  /**
   * Recibir una cesión **por partes**: un par volvió, otro se vendió, la caja
   * sigue prestada. Cada recepción suma sobre lo anterior; lo que vuelve entra
   * al inventario ya, lo vendido se vuelve una venta ya, y la cesión se cierra
   * sola cuando no queda nada afuera. Ver `recepcion-de-cesion.ts`.
   *
   * Con `cerrar`, lo que siga afuera después de esta recepción se da por
   * faltante y la cesión queda cerrada.
   */
  async recibir(
    id: string,
    dto: SettleDispatchDto,
    userId: string,
    tenantId: string,
    opciones: { cerrar?: boolean; totales?: boolean } = {},
  ) {
    const dispatch = await this.dispatchRepo.findOne({
      where: { id, tenantId },
      relations: ['items', 'seller'],
    });
    if (!dispatch) throw new NotFoundException('La remisión no existe');
    if (dispatch.status !== StreetDispatchStatus.OPEN) {
      throw new BadRequestException(
        `La cesión ${dispatch.dispatchNumber} ya está ` +
          `${dispatch.status === StreetDispatchStatus.SETTLED ? 'cerrada (cuadrada)' : 'anulada'}.`,
      );
    }
    if (dto.clientId) await this.assertClient(dto.clientId, tenantId);
    for (const payment of dto.payments ?? []) {
      if (payment.bankId) await this.assertBank(payment.bankId, tenantId);
    }

    const renglones = dispatch.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      variantSize: i.variantSize,
      variantColor: i.variantColor,
      quantity: i.quantity,
      quantitySold: i.quantitySold ?? 0,
      quantityReturned: i.quantityReturned ?? 0,
    }));
    const pedidas: LineaDeRecepcion[] = dto.items.map((l) => ({
      itemId: l.itemId,
      sold: l.sold,
      returned: l.returned,
    }));
    const lineas = opciones.totales
      ? deltasDesdeTotales(renglones, pedidas)
      : pedidas;

    // Cerrar sin que llegue nada es válido: es dar por faltante lo que sigue
    // afuera. Recibir sin que llegue nada, no.
    const errores = validarRecepcion(renglones, lineas).filter(
      (e) => !(opciones.cerrar && e.startsWith('No hay nada que recibir')),
    );
    if (errores.length) throw new BadRequestException(errores);

    const precios = new Map(
      dispatch.items.map((i) => [
        i.id,
        {
          id: i.id,
          unitPrice: Number(i.unitPrice),
          unitCost: Number(i.unitCost),
        },
      ]),
    );
    const revenue = lineas.reduce(
      (t, l) => t + (precios.get(l.itemId)?.unitPrice ?? 0) * (l.sold || 0),
      0,
    );

    // El pago no puede ser mayor de lo que se vendió **en esta recepción**.
    // Sin formas de pago se asume que entregó todo en efectivo.
    const cobrado = dto.payments?.length
      ? dto.payments.reduce((s, p) => s + p.amount, 0)
      : revenue;
    if (cobrado > revenue + 0.01) {
      throw new BadRequestException(
        `Se está registrando un cobro de $${cobrado.toLocaleString('es-CO')} ` +
          `sobre una venta de $${revenue.toLocaleString('es-CO')}.`,
      );
    }

    await retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (manager) => {
        await this.lockDispatch(manager, dispatch.id, tenantId);
        const despues = new Map(
          aplicarRecepcion(renglones, lineas).map((r) => [r.id, r]),
        );
        const porId = new Map(lineas.map((l) => [l.itemId, l]));
        const seCierra =
          !!opciones.cerrar || todoRecibido([...despues.values()]);

        for (const item of dispatch.items) {
          const line = porId.get(item.id) ?? {
            itemId: item.id,
            sold: 0,
            returned: 0,
          };
          const r = despues.get(item.id)!;
          if (line.sold > 0 || line.returned > 0) {
            await manager
              .getRepository(StreetDispatchItem)
              .update(
                { id: item.id, tenantId },
                {
                  quantitySold: r.quantitySold,
                  quantityReturned: r.quantityReturned,
                },
              );
          }

          // Un renglón puede ser una caja de seis. Vuelve entera solo si
          // vuelve toda y no se vendió nada de ella; si no, la caja ya no
          // existe como bulto y se repone la existencia sin código.
          const volvioEntero =
            r.quantityReturned === item.quantity && r.quantitySold === 0;
          if (line.returned > 0) {
            await this.ledger.mover(manager, {
              variantId: item.variantId,
              warehouseId: dispatch.warehouseId,
              cantidad: line.returned,
              motivo: 'STREET',
              referenciaId: dispatch.id,
              notas:
                `Volvió de la cesión ${dispatch.dispatchNumber} ` +
                `(${nombreDelDestino(dispatch)})` +
                (item.stockUnitId && !volvioEntero
                  ? ' · el bulto volvió partido: se repone la existencia sin código'
                  : ''),
              usuarioId: userId,
              unidades:
                volvioEntero && item.stockUnitId
                  ? [item.stockUnitId]
                  : undefined,
              tenantId,
            });
          }

          // El bulto etiquetado que no vuelve entero: vendido si se vendió
          // todo; y al cerrar, dado de baja si se partió o si no volvió.
          if (item.stockUnitId && !volvioEntero) {
            const vendidoEntero = r.quantitySold === item.quantity;
            const nextStatus = vendidoEntero
              ? StockUnitStatus.SOLD
              : seCierra
                ? StockUnitStatus.WRITTEN_OFF
                : null;
            const yaEstaba = await manager
              .getRepository(StockUnit)
              .findOne({ where: { id: item.stockUnitId, tenantId } });
            if (
              nextStatus &&
              yaEstaba &&
              yaEstaba.status === StockUnitStatus.CONSIGNED
            ) {
              await manager
                .getRepository(StockUnit)
                .update(
                  { id: item.stockUnitId, tenantId },
                  { status: nextStatus },
                );
              await manager.getRepository(StockUnitEvent).save(
                manager.getRepository(StockUnitEvent).create({
                  stockUnitId: item.stockUnitId,
                  eventType:
                    nextStatus === StockUnitStatus.SOLD
                      ? StockUnitEventType.SOLD
                      : StockUnitEventType.WRITTEN_OFF,
                  fromStatus: StockUnitStatus.CONSIGNED,
                  toStatus: nextStatus,
                  referenceType: REF_DISPATCH,
                  referenceId: dispatch.id,
                  userId,
                  metadata: {
                    sold: r.quantitySold,
                    returned: r.quantityReturned,
                    dispatchNumber: dispatch.dispatchNumber,
                  },
                  tenantId,
                }),
              );
            }
          }
        }

        let saleId: string | null = dispatch.saleId ?? null;
        if (revenue > 0) {
          saleId = await this.createStreetSale(
            manager,
            dispatch,
            [...precios.values()],
            lineas,
            dto,
            revenue,
            cobrado,
            userId,
            tenantId,
          );
        }

        if (seCierra) {
          await manager.getRepository(StreetDispatch).update(
            { id: dispatch.id, tenantId },
            {
              status: StreetDispatchStatus.SETTLED,
              settledAt: new Date(),
              settledById: userId,
              saleId,
              collectedAmount:
                Number(dispatch.collectedAmount ?? 0) +
                (revenue > 0 ? cobrado : 0),
            },
          );
        } else if (revenue > 0) {
          await manager.getRepository(StreetDispatch).update(
            { id: dispatch.id, tenantId },
            {
              saleId,
              collectedAmount: Number(dispatch.collectedAmount ?? 0) + cobrado,
            },
          );
        }
      }),
    );

    return this.findDispatch(id, tenantId);
  }

  /**
   * La venta de lo que el patinador vendió en la calle.
   *
   * **No descuenta inventario**: la mercancía ya salió al despachar, y volver a
   * descontarla dejaría el stock en negativo. El movimiento de inventario de
   * esta venta es el `OUT` del despacho, y la venta queda apuntando a la
   * remisión en sus notas para que la trazabilidad no se pierda.
   */
  private async createStreetSale(
    manager: EntityManager,
    dispatch: StreetDispatch,
    items: { id: string; unitPrice: number; unitCost: number }[],
    lines: SettlementLine[],
    dto: SettleDispatchDto,
    revenue: number,
    collected: number,
    userId: string,
    tenantId: string,
  ): Promise<string> {
    const byId = new Map(items.map((i) => [i.id, i]));
    const dispatchItems = new Map(dispatch.items.map((i) => [i.id, i]));
    // Lo que el patinador quedó debiendo. La venta no puede darse por pagada
    // mientras exista: así aparece en "pendientes de pago" y la caja cuadra
    // con la plata que de verdad entró.
    const pendiente = Math.max(
      0,
      Math.round((revenue - collected) * 100) / 100,
    );

    const sale = await manager.getRepository(Sale).save(
      manager.getRepository(Sale).create({
        saleNumber: await this.invoiceService.generateSaleNumber(tenantId),
        invoiceNumber:
          await this.invoiceService.generateInvoiceNumber(tenantId),
        clientId: dto.clientId,
        userId,
        warehouseId: dispatch.warehouseId,
        subtotal: revenue,
        discountAmount: 0,
        // La venta de calle no factura IVA aparte: el precio de calle es el que
        // se cobró. Si el negocio necesita discriminarlo, el reporte lo calcula
        // con la tasa de la tienda.
        taxAmount: 0,
        total: revenue,
        status: SaleStatus.COMPLETED,
        saleChannel: SaleChannel.CALLE,
        isPaid: pendiente <= 0.01,
        notes:
          `Venta de cesión — ${dispatch.dispatchNumber} ` +
          `(${nombreDelDestino(dispatch)})` +
          (pendiente > 0.01
            ? ` · Pendiente de cobro: $${pendiente.toLocaleString('es-CO')}`
            : ''),
        tenantId,
      }),
    );

    for (const line of lines) {
      if (line.sold <= 0) continue;
      const item = byId.get(line.itemId)!;
      const original = dispatchItems.get(line.itemId)!;
      await manager.getRepository(SaleItem).save(
        manager.getRepository(SaleItem).create({
          saleId: sale.id,
          variantId: original.variantId,
          productName: original.productName,
          variantSku: original.variantSku,
          variantBarcode: original.variantBarcode ?? null,
          variantSize: original.variantSize,
          variantColor: original.variantColor,
          quantity: line.sold,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          stockUnitId: original.stockUnitId,
          discountPercent: 0,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: item.unitPrice * line.sold,
          tenantId,
        }),
      );
    }

    const payments = dto.payments?.length
      ? dto.payments
      : [{ method: PaymentMethod.EFECTIVO, amount: revenue }];
    for (const p of payments) {
      await manager.getRepository(Payment).save(
        manager.getRepository(Payment).create({
          saleId: sale.id,
          method: p.method,
          amount: p.amount,
          bankId: p.bankId ?? null,
          reference: p.reference,
          receivedAmount: p.amount,
          changeAmount: 0,
          tenantId,
        }),
      );
    }

    return sale.id;
  }

  /** Anular: la mercancía vuelve completa al inventario. */
  async cancelDispatch(id: string, userId: string, tenantId: string) {
    const dispatch = await this.dispatchRepo.findOne({
      where: { id, tenantId },
      relations: ['items', 'seller'],
    });
    if (!dispatch) throw new NotFoundException('La remisión no existe');
    if (dispatch.status !== StreetDispatchStatus.OPEN) {
      throw new BadRequestException(
        `Solo se puede anular una remisión sin cuadrar. ` +
          `${dispatch.dispatchNumber} ya está ` +
          `${dispatch.status === StreetDispatchStatus.SETTLED ? 'cuadrada' : 'anulada'}.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // Igual que al cuadrar: el estado manda dentro de la transacción.
      await this.lockDispatch(manager, dispatch.id, tenantId);

      for (const item of dispatch.items) {
        await this.ledger.mover(manager, {
          variantId: item.variantId,
          warehouseId: dispatch.warehouseId,
          cantidad: item.quantity,
          motivo: 'STREET',
          referenciaId: dispatch.id,
          notas: `Anulación de ${dispatch.dispatchNumber}`,
          usuarioId: userId,
          unidades: item.stockUnitId ? [item.stockUnitId] : undefined,
          tenantId,
        });
      }

      await manager
        .getRepository(StreetDispatch)
        .update(
          { id: dispatch.id, tenantId },
          { status: StreetDispatchStatus.CANCELLED },
        );
    });

    return this.findDispatch(id, tenantId);
  }
}
