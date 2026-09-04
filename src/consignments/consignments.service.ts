import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Consignment } from './entities/consignment.entity.js';
import { ThirdPartyProduct } from './entities/third-party-product.entity.js';
import { ConsignmentPayment } from './entities/consignment-payment.entity.js';
import { claveDeProducto } from './producto-de-tercero.js';
import { CreateConsignmentDto } from './dto/create-consignment.dto.js';
import { UpdateConsignmentDto } from './dto/update-consignment.dto.js';
import { CreateConsignmentPaymentDto } from './dto/create-consignment-payment.dto.js';
import {
  cuentasDeVenta,
  resumenPorMetodo,
  saldoDelLado,
  aPesos,
  type AbonoLike,
  type CuentasDeVenta,
} from './terceros-cuentas.js';
import { Paginated } from '../common/types/paginated.js';
import { resolverPagina, armarPaginado } from '../common/utils/paginacion.js';

/**
 * Las tres formas de pago del sistema, entendiendo lo que se escribió a mano.
 * "Crédito" no es un cobro: es que aún no se ha pagado, así que no genera abono.
 */
export function normalizarMetodo(escrito: string | null | undefined): string {
  const limpio = (escrito ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!limpio) return '';
  if (limpio.startsWith('efectivo')) return 'EFECTIVO';
  if (limpio.startsWith('transferencia')) return 'TRANSFERENCIA';
  if (limpio.startsWith('credito') || limpio.startsWith('fiado')) {
    return 'CREDITO';
  }
  return escrito!.trim().toUpperCase();
}

export interface ConsignmentFilters {
  thirdParty?: string;
  clientPaid?: boolean;
  supplierPaid?: boolean;
  /** EFECTIVO | TRANSFERENCIA | CREDITO. */
  paymentMethod?: string;
  /** A quien limitar. `null` o ausente = sin limitar. */
  userId?: string | null;
}

@Injectable()
export class ConsignmentsService {
  constructor(
    @InjectRepository(Consignment)
    private readonly repo: Repository<Consignment>,
    @InjectRepository(ThirdPartyProduct)
    private readonly libretaRepo: Repository<ThirdPartyProduct>,
    @InjectRepository(ConsignmentPayment)
    private readonly abonoRepo: Repository<ConsignmentPayment>,
  ) {}

  async create(
    dto: CreateConsignmentDto,
    tenantId: string,
    usuarioId?: string,
  ): Promise<Consignment> {
    const metodo = normalizarMetodo(dto.paymentMethod);
    // Efectivo o transferencia = pagado al momento; crédito = queda debiendo.
    // Si el que llama manda clientPaid explícito, se respeta.
    const pagadoAlMomento =
      dto.clientPaid ?? (metodo === 'EFECTIVO' || metodo === 'TRANSFERENCIA');

    const entity = this.repo.create({
      thirdPartyName: dto.thirdPartyName.trim(),
      productDescription: dto.productDescription.trim(),
      size: dto.size?.trim() || '',
      color: dto.color?.trim() || '',
      quantity: dto.quantity ?? 1,
      costPrice: dto.costPrice,
      salePrice: dto.salePrice,
      clientName: dto.clientName?.trim() || '',
      clientPaid: pagadoAlMomento,
      supplierPaid: dto.supplierPaid ?? false,
      paymentMethod: dto.paymentMethod?.trim() || '',
      saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
      notes: dto.notes?.trim() || undefined,
      userId: usuarioId ?? null,
      tenantId,
    });
    const guardada = await this.repo.save(entity);
    await this.anotarEnLaLibreta(guardada);

    // Pago de contado → nace un abono CLIENT por el total, con su método, para
    // que el histórico y el desglose por método lo vean como cobrado.
    if (pagadoAlMomento) {
      const total = (Number(dto.salePrice) || 0) * (dto.quantity ?? 1);
      if (total > 0) {
        await this.abonoRepo.save(
          this.abonoRepo.create({
            consignmentId: guardada.id,
            lado: 'CLIENT',
            amount: total,
            method: metodo || 'EFECTIVO',
            paidAt: guardada.saleDate ?? new Date(),
            userId: usuarioId ?? null,
            notes: 'Pago de contado al registrar la venta',
            tenantId,
          }),
        );
      }
    }
    return guardada;
  }

  /**
   * Deja el producto anotado para la proxima vez.
   *
   * No falla la venta si esto falla: la venta es el hecho, la libreta es una
   * comodidad. Perder la comodidad no puede costar el registro de la plata.
   */
  private async anotarEnLaLibreta(venta: Consignment): Promise<void> {
    try {
      const clave = claveDeProducto(venta);
      const ya = await this.libretaRepo.findOne({
        where: { tenantId: venta.tenantId, clave },
      });
      const cuando = venta.saleDate ?? new Date();
      if (ya) {
        // Lo **ultimo**, no un promedio: quien revende compra cada semana a
        // otro precio, y lo que sirve para la proxima venta es lo de la vez
        // pasada.
        ya.lastCostPrice = venta.costPrice;
        ya.lastSalePrice = venta.salePrice;
        ya.timesSold += 1;
        ya.lastSoldAt = cuando;
        await this.libretaRepo.save(ya);
        return;
      }
      await this.libretaRepo.save(
        this.libretaRepo.create({
          tenantId: venta.tenantId,
          clave,
          thirdPartyName: venta.thirdPartyName,
          productDescription: venta.productDescription,
          size: venta.size || '',
          color: venta.color || '',
          lastCostPrice: venta.costPrice,
          lastSalePrice: venta.salePrice,
          timesSold: 1,
          lastSoldAt: cuando,
        }),
      );
    } catch {
      // Dos cajas registrando el mismo par a la vez chocan contra el indice
      // unico. La segunda no tiene nada que arreglar: el producto ya quedo.
    }
  }

  /** La libreta: lo que ya se vendio, para no volver a escribirlo. */
  async productos(
    tenantId: string,
    filtros: { q?: string; thirdParty?: string; limit?: number } = {},
  ): Promise<ThirdPartyProduct[]> {
    const qb = this.libretaRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId });
    if (filtros.thirdParty) {
      qb.andWhere('p.third_party_name ILIKE :duenyo', {
        duenyo: `%${filtros.thirdParty}%`,
      });
    }
    if (filtros.q) {
      qb.andWhere(
        '(p.product_description ILIKE :q OR p.third_party_name ILIKE :q)',
        { q: `%${filtros.q}%` },
      );
    }
    // Lo que mas se vende primero: en el mostrador, lo de siempre esta arriba.
    return qb
      .orderBy('p.times_sold', 'DESC')
      .addOrderBy('p.last_sold_at', 'DESC')
      .limit(Math.min(filtros.limit ?? 50, 200))
      .getMany();
  }

  private baseQuery(tenantId: string, filters: ConsignmentFilters) {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (filters.thirdParty) {
      qb.andWhere('c.thirdPartyName ILIKE :tp', {
        tp: `%${filters.thirdParty}%`,
      });
    }
    if (filters.clientPaid !== undefined) {
      qb.andWhere('c.clientPaid = :cp', { cp: filters.clientPaid });
    }
    if (filters.supplierPaid !== undefined) {
      qb.andWhere('c.supplierPaid = :sp', { sp: filters.supplierPaid });
    }
    // Filtro por método: "crédito" no es un método guardado, es lo que aún no
    // se ha cobrado (cliente sin pagar). Efectivo/transferencia matchean el
    // texto guardado, tolerando lo que se escribió a mano ("Efectivo").
    const metodo = normalizarMetodo(filters.paymentMethod);
    if (metodo === 'CREDITO') {
      qb.andWhere('c.clientPaid = false');
    } else if (metodo === 'EFECTIVO') {
      qb.andWhere('c.clientPaid = true').andWhere(
        "c.paymentMethod ILIKE 'efec%'",
      );
    } else if (metodo === 'TRANSFERENCIA') {
      qb.andWhere('c.clientPaid = true').andWhere(
        "c.paymentMethod ILIKE 'transf%'",
      );
    }
    // Cada quien lleva su contabilidad: dos personas naturales en la misma
    // tienda no pueden verse la plata.
    if (filters.userId) {
      qb.andWhere('c.userId = :uid', { uid: filters.userId });
    }
    return qb;
  }

  async findAll(
    tenantId: string,
    filters: ConsignmentFilters = {},
  ): Promise<Consignment[]> {
    return this.baseQuery(tenantId, filters)
      .orderBy('c.saleDate', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .getMany();
  }

  /**
   * El listado por página. Antes se traía todo y el navegador filtraba por
   * texto y por fecha; ahora esos dos filtros —búsqueda por cliente/tercero y
   * rango de `saleDate`— viajan al servidor junto con los de estado.
   */
  async findAllPaginado(
    tenantId: string,
    filters: ConsignmentFilters & {
      page?: string | number | null;
      limit?: string | number | null;
      search?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<Paginated<Consignment>> {
    const pagina = resolverPagina(filters, { limitDefault: 50, limitMax: 200 });
    const qb = this.baseQuery(tenantId, filters);

    const search = filters.search?.trim();
    if (search) {
      // El navegador buscaba sobre `cliente + tercero`; se replica igual.
      qb.andWhere(
        '(c.clientName ILIKE :s OR c.thirdPartyName ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (filters.from && filters.to) {
      qb.andWhere('c.saleDate BETWEEN :from AND :to', {
        from: filters.from,
        to: filters.to,
      });
    }

    const [data, total] = await qb
      .orderBy('c.saleDate', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit)
      .getManyAndCount();

    // Saldos por venta (abono cliente/tercero) para pintar el estado real.
    const abonos = await this.abonosPorVenta(
      data.map((c) => c.id),
      tenantId,
    );
    const conCuentas = this.adjuntarCuentas(data, abonos);

    return armarPaginado(conCuentas, total, pagina);
  }

  async findOne(id: string, tenantId: string): Promise<Consignment> {
    const item = await this.repo.findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Venta de tercero no encontrada');
    return item;
  }

  // ── Abonos ────────────────────────────────────────────────────────────────

  /** Los abonos de una venta, del más nuevo al más viejo. */
  async abonosDe(
    id: string,
    tenantId: string,
  ): Promise<ConsignmentPayment[]> {
    await this.findOne(id, tenantId); // valida pertenencia al tenant
    return this.abonoRepo.find({
      where: { consignmentId: id, tenantId },
      order: { paidAt: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Registra un abono a un lado (cliente o tercero). No deja abonar más que el
   * saldo, y mantiene el booleano `clientPaid`/`supplierPaid` como caché para
   * que los filtros de siempre sigan funcionando.
   */
  async abonar(
    id: string,
    dto: CreateConsignmentPaymentDto,
    tenantId: string,
    usuarioId?: string,
  ): Promise<{ abono: ConsignmentPayment; cuentas: CuentasDeVenta }> {
    const venta = await this.findOne(id, tenantId);
    const abonos = await this.abonoRepo.find({
      where: { consignmentId: id, tenantId },
    });

    const saldoCents = saldoDelLado(venta, abonos as AbonoLike[], dto.lado);
    if (saldoCents <= 0) {
      throw new BadRequestException(
        dto.lado === 'CLIENT'
          ? 'El cliente ya pagó esta venta.'
          : 'Ya le pagaste al tercero esta venta.',
      );
    }
    const montoCents = Math.round((Number(dto.amount) || 0) * 100);
    if (montoCents <= 0) {
      throw new BadRequestException('El abono debe ser mayor a cero.');
    }
    if (montoCents > saldoCents) {
      throw new BadRequestException(
        `El abono ($${aPesos(montoCents).toLocaleString('es-CO')}) supera el saldo pendiente ($${aPesos(
          saldoCents,
        ).toLocaleString('es-CO')}).`,
      );
    }

    const abono = await this.abonoRepo.save(
      this.abonoRepo.create({
        consignmentId: id,
        lado: dto.lado,
        amount: dto.amount,
        method: normalizarMetodo(dto.method) || null,
        reference: dto.reference?.trim() || null,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        userId: usuarioId ?? null,
        notes: dto.notes?.trim() || null,
        tenantId,
      }),
    );

    // Recalcular con el abono nuevo y sincronizar el booleano-caché.
    const cuentas = cuentasDeVenta(venta, [
      ...(abonos as AbonoLike[]),
      { lado: dto.lado, amount: dto.amount, method: abono.method },
    ]);
    const nuevoClientPaid = cuentas.clientPaid;
    const nuevoSupplierPaid = cuentas.supplierPaid;
    if (
      venta.clientPaid !== nuevoClientPaid ||
      venta.supplierPaid !== nuevoSupplierPaid
    ) {
      venta.clientPaid = nuevoClientPaid;
      venta.supplierPaid = nuevoSupplierPaid;
      await this.repo.save(venta);
    }

    return { abono, cuentas };
  }

  /**
   * Trae los abonos de varias ventas de una sola consulta (evita N+1 al armar
   * el listado o el resumen).
   */
  private async abonosPorVenta(
    ids: string[],
    tenantId: string,
  ): Promise<Map<string, ConsignmentPayment[]>> {
    const mapa = new Map<string, ConsignmentPayment[]>();
    if (ids.length === 0) return mapa;
    const abonos = await this.abonoRepo.find({
      where: { consignmentId: In(ids), tenantId },
      order: { paidAt: 'DESC' },
    });
    for (const a of abonos) {
      const arr = mapa.get(a.consignmentId);
      if (arr) arr.push(a);
      else mapa.set(a.consignmentId, [a]);
    }
    return mapa;
  }

  /** Adjunta saldos (en pesos) a cada venta, para el listado. */
  private adjuntarCuentas(
    ventas: Consignment[],
    abonosPorId: Map<string, ConsignmentPayment[]>,
  ): (Consignment & {
    cobradoCliente: number;
    saldoCliente: number;
    pagadoTercero: number;
    saldoTercero: number;
  })[] {
    return ventas.map((v) => {
      const c = cuentasDeVenta(
        v,
        (abonosPorId.get(v.id) ?? []) as AbonoLike[],
      );
      return Object.assign(v, {
        cobradoCliente: aPesos(c.cobradoClienteCents),
        saldoCliente: aPesos(c.saldoClienteCents),
        pagadoTercero: aPesos(c.pagadoTerceroCents),
        saldoTercero: aPesos(c.saldoTerceroCents),
      });
    });
  }

  async update(
    id: string,
    dto: UpdateConsignmentDto,
    tenantId: string,
  ): Promise<Consignment> {
    const item = await this.findOne(id, tenantId);
    if (dto.thirdPartyName !== undefined)
      item.thirdPartyName = dto.thirdPartyName.trim();
    if (dto.productDescription !== undefined)
      item.productDescription = dto.productDescription.trim();
    if (dto.size !== undefined) item.size = dto.size.trim();
    if (dto.color !== undefined) item.color = dto.color.trim();
    if (dto.quantity !== undefined) item.quantity = dto.quantity;
    if (dto.costPrice !== undefined) item.costPrice = dto.costPrice;
    if (dto.salePrice !== undefined) item.salePrice = dto.salePrice;
    if (dto.clientName !== undefined) item.clientName = dto.clientName.trim();
    if (dto.clientPaid !== undefined) item.clientPaid = dto.clientPaid;
    if (dto.supplierPaid !== undefined) item.supplierPaid = dto.supplierPaid;
    if (dto.paymentMethod !== undefined)
      item.paymentMethod = dto.paymentMethod.trim();
    if (dto.saleDate !== undefined) item.saleDate = new Date(dto.saleDate);
    if (dto.notes !== undefined) item.notes = dto.notes.trim();
    return this.repo.save(item);
  }

  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const item = await this.findOne(id, tenantId);
    await this.repo.remove(item);
    return { success: true };
  }

  /**
   * Resumen: utilidad total, cuánto te deben los clientes (CxC) y cuánto le
   * debes a los terceros (CxP), + desglose por tercero.
   */
  async summary(
    tenantId: string,
    usuarioId?: string | null,
    from?: string,
    to?: string,
  ): Promise<{
    count: number;
    /** Suma de la columna Cantidad: cuántas unidades se vendieron en el rango. */
    totalQuantity: number;
    totalSale: number;
    totalCost: number;
    totalProfit: number;
    owedByClients: number;
    owedToThirdParties: number;
    byThirdParty: {
      thirdPartyName: string;
      count: number;
      profit: number;
      owedToThem: number;
    }[];
    /** Cuánto entró por cada método (efectivo/transferencia/…). */
    porMetodo: { metodo: string; cobrado: number }[];
    /** Lo cobrado en total (suma de abonos de clientes). */
    totalCobrado: number;
  }> {
    // Mismo rango de fechas que el listado (`saleDate BETWEEN`), para que la
    // utilidad y los totales de las tarjetas cuadren con lo que se ve abajo al
    // filtrar por "hoy" o "ayer". Sin rango, es el total histórico como antes.
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (usuarioId) qb.andWhere('c.userId = :usuarioId', { usuarioId });
    if (from && to) {
      qb.andWhere('c.saleDate BETWEEN :from AND :to', { from, to });
    }
    const rows = await qb.getMany();

    // Abonos de todas las ventas del rango, de una consulta. El saldo se
    // calcula con ellos (no con el booleano), así el abono parcial cuenta.
    const abonosPorId = await this.abonosPorVenta(
      rows.map((r) => r.id),
      tenantId,
    );

    let totalSale = 0;
    let totalCost = 0;
    let totalQuantity = 0;
    let owedByClients = 0;
    let owedToThirdParties = 0;
    const byTp = new Map<
      string,
      {
        thirdPartyName: string;
        count: number;
        profit: number;
        owedToThem: number;
      }
    >();
    for (const r of rows) {
      const qty = r.quantity || 1;
      const sale = Number(r.salePrice) * qty;
      const cost = Number(r.costPrice) * qty;
      const cuentas = cuentasDeVenta(
        r,
        (abonosPorId.get(r.id) ?? []) as AbonoLike[],
      );
      totalSale += sale;
      totalCost += cost;
      totalQuantity += qty;
      owedByClients += aPesos(cuentas.saldoClienteCents);
      owedToThirdParties += aPesos(cuentas.saldoTerceroCents);
      const key = r.thirdPartyName || '(sin nombre)';
      const agg = byTp.get(key) || {
        thirdPartyName: key,
        count: 0,
        profit: 0,
        owedToThem: 0,
      };
      agg.count += 1;
      agg.profit += sale - cost;
      agg.owedToThem += aPesos(cuentas.saldoTerceroCents);
      byTp.set(key, agg);
    }

    const desglose = resumenPorMetodo(
      rows.map((r) => ({
        venta: r,
        abonos: (abonosPorId.get(r.id) ?? []) as AbonoLike[],
      })),
    );

    return {
      count: rows.length,
      totalQuantity,
      totalSale,
      totalCost,
      totalProfit: totalSale - totalCost,
      owedByClients,
      owedToThirdParties,
      byThirdParty: [...byTp.values()].sort((a, b) => b.profit - a.profit),
      porMetodo: desglose.porMetodo.map((m) => ({
        metodo: m.metodo,
        cobrado: aPesos(m.cobradoCents),
      })),
      totalCobrado: aPesos(desglose.totalCobradoCents),
    };
  }

  /** Nombres de terceros distintos (para autocompletar). */
  async thirdParties(tenantId: string): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('DISTINCT c.thirdPartyName', 'name')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere("c.thirdPartyName <> ''")
      .orderBy('name', 'ASC')
      .getRawMany<{ name: string }>();
    return rows.map((r) => r.name);
  }
}
