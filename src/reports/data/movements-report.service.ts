import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockMovement } from '../../inventory/entities/stock-movement.entity.js';
import { StockTransfer } from '../../inventory/entities/stock-transfer.entity.js';
import { InventoryCount } from '../../inventory/entities/inventory-count.entity.js';
import { InventoryCountLine } from '../../inventory/entities/inventory-count-line.entity.js';
import { ReturnItem } from '../../returns/entities/return-item.entity.js';
import { Consignment } from '../../consignments/entities/consignment.entity.js';
import { Voucher } from '../../vouchers/entities/voucher.entity.js';
import {
  int,
  localDaySql,
  localDateTimeSql,
  money,
  timestampRangeSql,
} from '../engine/report-filters.js';
import type {
  RawRow,
  ReportQuery,
  ReportResult,
} from '../engine/report-types.js';

const MAX_ROWS = 20000;
const MODES = [
  'ajustes',
  'traslados',
  'devoluciones',
  'conteos',
  'consignaciones',
  'bonos',
] as const;

const TRANSFER_STATUSES = ['PENDING', 'RECEIVED', 'RETURNED', 'CANCELLED'];

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Sin recibir',
  RECEIVED: 'Recibido',
  RETURNED: 'Devuelto',
  CANCELLED: 'Anulado',
};

/**
 * Movimientos y novedades: todo lo que movió inventario o plata sin ser una
 * venta. Un solo reporte con seis modos, en lugar de seis páginas.
 */
@Injectable()
export class MovementsReportService {
  constructor(
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
    @InjectRepository(StockTransfer)
    private readonly transferRepo: Repository<StockTransfer>,
    @InjectRepository(InventoryCount)
    private readonly countRepo: Repository<InventoryCount>,
    @InjectRepository(InventoryCountLine)
    private readonly countLineRepo: Repository<InventoryCountLine>,
    @InjectRepository(ReturnItem)
    private readonly returnItemRepo: Repository<ReturnItem>,
    @InjectRepository(Consignment)
    private readonly consignmentRepo: Repository<Consignment>,
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  run(query: ReportQuery, tenantId: string): Promise<ReportResult> {
    switch (query.pick('mode', MODES, 'ajustes')) {
      case 'traslados':
        return this.transfers(query, tenantId);
      case 'devoluciones':
        return this.returns(query, tenantId);
      case 'conteos':
        return this.counts(query, tenantId);
      case 'consignaciones':
        return this.consignments(query, tenantId);
      case 'bonos':
        return this.vouchers(query, tenantId);
      default:
        return this.adjustments(query, tenantId);
    }
  }

  private cap(count: number, unidad: string): string[] {
    return count >= MAX_ROWS
      ? [
          `Se muestran ${MAX_ROWS.toLocaleString('es-CO')} ${unidad} como máximo; ` +
            `los totales solo cubren esos. Acota el período.`,
        ]
      : [];
  }

  /**
   * Ajustes y bajas: lo que salió o entró sin venta ni compra.
   *
   * El "motivo" es la nota que se escribió al hacerlo, que es donde queda el
   * porqué (incluidos los ajustes automáticos de un conteo físico, que dicen
   * qué decía el sistema y qué se contó).
   */
  private async adjustments(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .innerJoin('m.variant', 'v')
      .innerJoin('v.product', 'p')
      .innerJoin('m.warehouse', 'w')
      .leftJoin('m.createdBy', 'u')
      .leftJoin('v.sizeRef', 'sz')
      .leftJoin('v.colorRef', 'co')
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('m.created_at'), {
        from: query.from,
        to: query.to,
      })
      // Ni ventas ni compras: eso ya tiene su propio reporte. Aquí queda la
      // merma, la baja, el ajuste de conteo y la corrección a mano.
      .andWhere("m.movement_type IN ('ADJUSTMENT', 'OUT')")
      .andWhere(
        "(m.reference_type IS NULL OR m.reference_type NOT IN ('SALE', 'PURCHASE'))",
      );

    const warehouseId = query.uuid('warehouseId');
    if (warehouseId)
      qb.andWhere('m.warehouse_id = :warehouseId', { warehouseId });
    const userId = query.uuid('userId');
    if (userId) qb.andWhere('m.created_by = :userId', { userId });
    const search = query.text('search');
    if (search) {
      qb.andWhere(
        '(p.name ILIKE :q OR v.sku ILIKE :q OR m.notes ILIKE :q OR v.barcode ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    const raw = await qb
      .select(localDateTimeSql('m.created_at'), 'fecha')
      .addSelect('m.movement_type', 'tipo')
      .addSelect('w.name', 'bodega')
      .addSelect('p.name', 'producto')
      .addSelect('v.sku', 'sku')
      .addSelect("COALESCE(sz.name, '—')", 'talla')
      .addSelect("COALESCE(co.name, '—')", 'color')
      .addSelect('m.quantity', 'cantidad')
      .addSelect("COALESCE(m.notes, 'Sin motivo registrado')", 'motivo')
      .addSelect(
        "COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), '—')",
        'usuario',
      )
      .addSelect('p.cost_price', 'costoUnit')
      .orderBy('m.created_at', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const rows = raw.map((r) => {
      const cantidad = int(r.cantidad);
      const costoUnit = money(r.costoUnit);
      return {
        fecha: String(r.fecha ?? ''),
        tipo: r.tipo === 'OUT' ? 'Salida' : 'Ajuste',
        bodega: String(r.bodega ?? ''),
        producto: String(r.producto ?? ''),
        sku: String(r.sku ?? ''),
        talla: String(r.talla ?? ''),
        color: String(r.color ?? ''),
        cantidad,
        costoUnit,
        valorCosto: money(cantidad * costoUnit),
        motivo: String(r.motivo ?? ''),
        usuario: String(r.usuario ?? ''),
      };
    });

    const sinMotivo = rows.filter(
      (r) => r.motivo === 'Sin motivo registrado',
    ).length;
    const warnings = this.cap(raw.length, 'movimientos');
    if (sinMotivo) {
      warnings.push(
        `${sinMotivo} movimiento(s) no tienen motivo escrito. Un ajuste sin ` +
          `motivo no se puede auditar después.`,
      );
    }

    return {
      columns: [
        { key: 'fecha', label: 'Fecha', type: 'datetime' },
        { key: 'tipo', label: 'Tipo', type: 'text' },
        { key: 'bodega', label: 'Bodega', type: 'text' },
        { key: 'producto', label: 'Producto', type: 'text' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'talla', label: 'Talla', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
        { key: 'cantidad', label: 'Unidades', type: 'number' },
        { key: 'costoUnit', label: 'Costo unit.', type: 'money' },
        { key: 'valorCosto', label: 'Valor', type: 'money' },
        { key: 'motivo', label: 'Motivo', type: 'text' },
        { key: 'usuario', label: 'Usuario', type: 'text' },
      ],
      rows,
      totals: [
        {
          key: 'movimientos',
          label: 'Movimientos',
          type: 'number',
          value: rows.length,
        },
        {
          key: 'unidades',
          label: 'Unidades',
          type: 'number',
          value: rows.reduce((s, r) => s + r.cantidad, 0),
        },
        {
          key: 'valorCosto',
          label: 'Valor al costo',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.valorCosto, 0)),
        },
      ],
      title: `Ajustes y bajas ${query.from} a ${query.to}`,
      warnings,
    };
  }

  /** Traslados entre bodegas: los que faltan por recibir y los cerrados. */
  private async transfers(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.transferRepo
      .createQueryBuilder('t')
      .innerJoin('t.variant', 'v')
      .innerJoin('v.product', 'p')
      .innerJoin('t.fromWarehouse', 'wf')
      .innerJoin('t.toWarehouse', 'wt')
      .leftJoin('v.sizeRef', 'sz')
      .leftJoin('v.colorRef', 'co')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('t.created_at'), {
        from: query.from,
        to: query.to,
      });

    const status = query.text('status');
    if (status && TRANSFER_STATUSES.includes(status)) {
      qb.andWhere('t.status = :status', { status });
    }
    const warehouseId = query.uuid('warehouseId');
    if (warehouseId) {
      qb.andWhere(
        '(t.from_warehouse_id = :warehouseId OR t.to_warehouse_id = :warehouseId)',
        { warehouseId },
      );
    }
    const search = query.text('search');
    if (search) {
      qb.andWhere('(p.name ILIKE :q OR v.sku ILIKE :q OR t.notes ILIKE :q)', {
        q: `%${search}%`,
      });
    }

    const raw = await qb
      .select(localDateTimeSql('t.created_at'), 'fecha')
      .addSelect('t.type', 'tipo')
      .addSelect('t.status', 'estado')
      .addSelect('wf.name', 'origen')
      .addSelect('wt.name', 'destino')
      .addSelect('p.name', 'producto')
      .addSelect('v.sku', 'sku')
      .addSelect("COALESCE(sz.name, '—')", 'talla')
      .addSelect("COALESCE(co.name, '—')", 'color')
      .addSelect('t.quantity', 'cantidad')
      .addSelect('p.cost_price', 'costoUnit')
      .addSelect(
        `CASE WHEN t.received_at IS NULL THEN '—' ELSE ${localDaySql('t.received_at')} END`,
        'recibido',
      )
      .addSelect("COALESCE(t.notes, '')", 'nota')
      .orderBy('t.created_at', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const rows = raw.map((r) => {
      const cantidad = int(r.cantidad);
      const costoUnit = money(r.costoUnit);
      return {
        fecha: String(r.fecha ?? ''),
        tipo: r.tipo === 'LOAN' ? 'Préstamo' : 'Traslado',
        estado: TRANSFER_STATUS_LABEL[String(r.estado)] ?? String(r.estado),
        origen: String(r.origen ?? ''),
        destino: String(r.destino ?? ''),
        producto: String(r.producto ?? ''),
        sku: String(r.sku ?? ''),
        talla: String(r.talla ?? ''),
        color: String(r.color ?? ''),
        cantidad,
        valorCosto: money(cantidad * costoUnit),
        recibido: String(r.recibido ?? '—'),
        nota: String(r.nota ?? ''),
      };
    });

    const pendientes = raw.filter((r) => r.estado === 'PENDING').length;

    return {
      columns: [
        { key: 'fecha', label: 'Enviado', type: 'datetime' },
        { key: 'tipo', label: 'Tipo', type: 'text' },
        { key: 'estado', label: 'Estado', type: 'text' },
        { key: 'origen', label: 'Origen', type: 'text' },
        { key: 'destino', label: 'Destino', type: 'text' },
        { key: 'producto', label: 'Producto', type: 'text' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'talla', label: 'Talla', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
        { key: 'cantidad', label: 'Unidades', type: 'number' },
        { key: 'valorCosto', label: 'Valor al costo', type: 'money' },
        { key: 'recibido', label: 'Recibido', type: 'date' },
        { key: 'nota', label: 'Nota', type: 'text' },
      ],
      rows,
      totals: [
        {
          key: 'traslados',
          label: 'Traslados',
          type: 'number',
          value: rows.length,
        },
        {
          key: 'pendientes',
          label: 'Sin recibir',
          type: 'number',
          value: pendientes,
          hint: 'Mercancía que salió y nadie confirmó que llegó',
        },
        {
          key: 'unidades',
          label: 'Unidades',
          type: 'number',
          value: rows.reduce((s, r) => s + r.cantidad, 0),
        },
        {
          key: 'valorCosto',
          label: 'Valor al costo',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.valorCosto, 0)),
        },
      ],
      title: `Traslados entre bodegas ${query.from} a ${query.to}`,
      warnings: this.cap(raw.length, 'traslados'),
    };
  }

  /** Devoluciones de venta, línea por línea. */
  private async returns(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.returnItemRepo
      .createQueryBuilder('ri')
      .innerJoin('ri.return', 'r')
      .innerJoin('ri.variant', 'v')
      .innerJoin('v.product', 'p')
      .leftJoin('r.sale', 's')
      .leftJoin('r.client', 'cl')
      .leftJoin('r.user', 'u')
      .leftJoin('v.sizeRef', 'sz')
      .leftJoin('v.colorRef', 'co')
      .where('r.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('r.created_at'), {
        from: query.from,
        to: query.to,
      });

    const userId = query.uuid('userId');
    if (userId) qb.andWhere('r.user_id = :userId', { userId });
    const search = query.text('search');
    if (search) {
      qb.andWhere(
        '(p.name ILIKE :q OR v.sku ILIKE :q OR r.return_number ILIKE :q' +
          ' OR r.reason ILIKE :q OR s.sale_number ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    const raw = await qb
      .select(localDateTimeSql('r.created_at'), 'fecha')
      .addSelect('r.return_number', 'devolucion')
      .addSelect("COALESCE(s.sale_number, '—')", 'venta')
      .addSelect('r.status', 'estado')
      .addSelect('r.reason', 'motivo')
      .addSelect(
        "COALESCE(NULLIF(TRIM(COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, '')), ''), '—')",
        'cliente',
      )
      .addSelect(
        "COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), '—')",
        'usuario',
      )
      .addSelect('p.name', 'producto')
      .addSelect('v.sku', 'sku')
      .addSelect("COALESCE(sz.name, '—')", 'talla')
      .addSelect("COALESCE(co.name, '—')", 'color')
      .addSelect('ri.quantity', 'cantidad')
      .addSelect('ri.unit_price', 'precioUnit')
      .orderBy('r.created_at', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const rows = raw.map((r) => {
      const cantidad = int(r.cantidad);
      const precioUnit = money(r.precioUnit);
      return {
        fecha: String(r.fecha ?? ''),
        devolucion: String(r.devolucion ?? ''),
        venta: String(r.venta ?? ''),
        estado: String(r.estado ?? ''),
        cliente: String(r.cliente ?? ''),
        usuario: String(r.usuario ?? ''),
        producto: String(r.producto ?? ''),
        sku: String(r.sku ?? ''),
        talla: String(r.talla ?? ''),
        color: String(r.color ?? ''),
        cantidad,
        precioUnit,
        valor: money(cantidad * precioUnit),
        motivo: String(r.motivo ?? ''),
      };
    });

    return {
      columns: [
        { key: 'fecha', label: 'Fecha', type: 'datetime' },
        { key: 'devolucion', label: 'Devolución', type: 'text' },
        { key: 'venta', label: 'Venta original', type: 'text' },
        { key: 'estado', label: 'Estado', type: 'text' },
        { key: 'cliente', label: 'Cliente', type: 'text' },
        { key: 'usuario', label: 'Registró', type: 'text' },
        { key: 'producto', label: 'Producto', type: 'text' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'talla', label: 'Talla', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
        { key: 'cantidad', label: 'Unidades', type: 'number' },
        { key: 'precioUnit', label: 'Precio unit.', type: 'money' },
        { key: 'valor', label: 'Valor devuelto', type: 'money' },
        { key: 'motivo', label: 'Motivo', type: 'text' },
      ],
      rows,
      totals: [
        { key: 'lineas', label: 'Líneas', type: 'number', value: rows.length },
        {
          key: 'unidades',
          label: 'Unidades devueltas',
          type: 'number',
          value: rows.reduce((s, r) => s + r.cantidad, 0),
        },
        {
          key: 'valor',
          label: 'Valor devuelto',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.valor, 0)),
        },
      ],
      title: `Devoluciones ${query.from} a ${query.to}`,
      warnings: this.cap(raw.length, 'líneas'),
    };
  }

  /**
   * Conteos físicos. Las diferencias de un conteo cerrado **no se guardan**:
   * quedan como movimientos de ajuste con el motivo escrito (sistema decía X,
   * se contó Y), así que se ven en el modo Ajustes buscando el número del
   * conteo. El aviso lo dice.
   */
  private async counts(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.countRepo
      .createQueryBuilder('ic')
      .innerJoin('ic.warehouse', 'w')
      .where('ic.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('ic.started_at'), {
        from: query.from,
        to: query.to,
      });

    const warehouseId = query.uuid('warehouseId');
    if (warehouseId)
      qb.andWhere('ic.warehouse_id = :warehouseId', { warehouseId });
    const search = query.text('search');
    if (search) {
      qb.andWhere('(ic.count_number ILIKE :q OR ic.notes ILIKE :q)', {
        q: `%${search}%`,
      });
    }

    const counts = await qb
      .select('ic.id', 'id')
      .addSelect('ic.count_number', 'numero')
      .addSelect('w.name', 'bodega')
      .addSelect('ic.status', 'estado')
      .addSelect(localDaySql('ic.started_at'), 'inicio')
      .addSelect(
        `CASE WHEN ic.closed_at IS NULL THEN '—' ELSE ${localDaySql('ic.closed_at')} END`,
        'cierre',
      )
      .addSelect("COALESCE(ic.notes, '')", 'nota')
      .orderBy('ic.started_at', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    // Lo contado por conteo, en una sola consulta (no una por fila).
    const ids = counts.map((c) => c.id as string);
    const tally = new Map<string, { refs: number; unidades: number }>();
    if (ids.length) {
      const lines = await this.countLineRepo
        .createQueryBuilder('l')
        .select('l.count_id', 'countId')
        .addSelect('COUNT(*)', 'refs')
        .addSelect('COALESCE(SUM(l.counted_quantity), 0)', 'unidades')
        .where('l.tenant_id = :tenantId', { tenantId })
        .andWhere('l.count_id IN (:...ids)', { ids })
        .groupBy('l.count_id')
        .getRawMany<RawRow>();
      for (const l of lines) {
        tally.set(String(l.countId), {
          refs: int(l.refs),
          unidades: int(l.unidades),
        });
      }
    }

    const rows = counts.map((c) => {
      const t = tally.get(String(c.id)) ?? { refs: 0, unidades: 0 };
      return {
        numero: String(c.numero ?? ''),
        bodega: String(c.bodega ?? ''),
        estado: c.estado === 'CLOSED' ? 'Cerrado' : 'Abierto',
        inicio: String(c.inicio ?? ''),
        cierre: String(c.cierre ?? '—'),
        referencias: t.refs,
        unidades: t.unidades,
        nota: String(c.nota ?? ''),
      };
    });

    return {
      columns: [
        { key: 'numero', label: 'Conteo', type: 'text' },
        { key: 'bodega', label: 'Bodega', type: 'text' },
        { key: 'estado', label: 'Estado', type: 'text' },
        { key: 'inicio', label: 'Inicio', type: 'date' },
        { key: 'cierre', label: 'Cierre', type: 'date' },
        { key: 'referencias', label: 'Referencias contadas', type: 'number' },
        { key: 'unidades', label: 'Unidades contadas', type: 'number' },
        { key: 'nota', label: 'Nota', type: 'text' },
      ],
      rows,
      totals: [
        {
          key: 'conteos',
          label: 'Conteos',
          type: 'number',
          value: rows.length,
        },
        {
          key: 'abiertos',
          label: 'Abiertos',
          type: 'number',
          value: rows.filter((r) => r.estado === 'Abierto').length,
        },
        {
          key: 'unidades',
          label: 'Unidades contadas',
          type: 'number',
          value: rows.reduce((s, r) => s + r.unidades, 0),
        },
      ],
      title: `Conteos físicos ${query.from} a ${query.to}`,
      warnings: [
        'Las diferencias de un conteo cerrado quedan como movimientos de ajuste ' +
          'con el motivo escrito. Para verlas, usa el modo "Ajustes y bajas" y ' +
          'busca el número del conteo.',
      ],
    };
  }

  /** Ventas de terceros (consignación). */
  private async consignments(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.consignmentRepo
      .createQueryBuilder('cs')
      .where('cs.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('cs.sale_date'), {
        from: query.from,
        to: query.to,
      });

    const search = query.text('search');
    if (search) {
      qb.andWhere(
        '(cs.third_party_name ILIKE :q OR cs.product_description ILIKE :q' +
          ' OR cs.client_name ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    const raw = await qb
      .select(localDaySql('cs.sale_date'), 'fecha')
      .addSelect('cs.third_party_name', 'tercero')
      .addSelect('cs.product_description', 'producto')
      .addSelect("COALESCE(NULLIF(cs.size, ''), '—')", 'talla')
      .addSelect("COALESCE(NULLIF(cs.color, ''), '—')", 'color')
      .addSelect('cs.quantity', 'cantidad')
      .addSelect('cs.cost_price', 'costoUnit')
      .addSelect('cs.sale_price', 'precioUnit')
      .addSelect("COALESCE(NULLIF(cs.client_name, ''), '—')", 'cliente')
      .addSelect('cs.client_paid', 'clientePago')
      .addSelect('cs.supplier_paid', 'terceroPagado')
      .addSelect("COALESCE(NULLIF(cs.payment_method, ''), '—')", 'metodo')
      .orderBy('cs.sale_date', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const rows = raw.map((r) => {
      const cantidad = int(r.cantidad);
      const costo = money(money(r.costoUnit) * cantidad);
      const venta = money(money(r.precioUnit) * cantidad);
      return {
        fecha: String(r.fecha ?? ''),
        tercero: String(r.tercero ?? ''),
        producto: String(r.producto ?? ''),
        talla: String(r.talla ?? ''),
        color: String(r.color ?? ''),
        cliente: String(r.cliente ?? ''),
        metodo: String(r.metodo ?? ''),
        cantidad,
        costo,
        venta,
        utilidad: money(venta - costo),
        clientePago: r.clientePago ? 'Sí' : 'No',
        terceroPagado: r.terceroPagado ? 'Sí' : 'No',
      };
    });

    const porCobrar = money(
      rows
        .filter((r) => r.clientePago === 'No')
        .reduce((s, r) => s + r.venta, 0),
    );
    const porPagar = money(
      rows
        .filter((r) => r.terceroPagado === 'No')
        .reduce((s, r) => s + r.costo, 0),
    );

    return {
      columns: [
        { key: 'fecha', label: 'Fecha', type: 'date' },
        { key: 'tercero', label: 'Dueño', type: 'text' },
        { key: 'producto', label: 'Producto', type: 'text' },
        { key: 'talla', label: 'Talla', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
        { key: 'cliente', label: 'Cliente', type: 'text' },
        { key: 'metodo', label: 'Forma de pago', type: 'text' },
        { key: 'cantidad', label: 'Unidades', type: 'number' },
        { key: 'costo', label: 'Costo (al dueño)', type: 'money' },
        { key: 'venta', label: 'Vendido', type: 'money' },
        { key: 'utilidad', label: 'Utilidad', type: 'money' },
        { key: 'clientePago', label: '¿Pagó el cliente?', type: 'text' },
        { key: 'terceroPagado', label: '¿Se le pagó al dueño?', type: 'text' },
      ],
      rows,
      totals: [
        { key: 'ventas', label: 'Ventas', type: 'number', value: rows.length },
        {
          key: 'venta',
          label: 'Vendido',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.venta, 0)),
        },
        {
          key: 'utilidad',
          label: 'Utilidad',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.utilidad, 0)),
        },
        {
          key: 'porCobrar',
          label: 'Falta cobrar',
          type: 'money',
          value: porCobrar,
        },
        {
          key: 'porPagar',
          label: 'Falta pagar al dueño',
          type: 'money',
          value: porPagar,
        },
      ],
      title: `Ventas de terceros ${query.from} a ${query.to}`,
      warnings: this.cap(raw.length, 'ventas'),
    };
  }

  /** Bonos y cupones: emitidos, canjeados y vencidos. */
  private async vouchers(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.voucherRepo
      .createQueryBuilder('vo')
      .leftJoin('sales', 's', 's.id = vo.redeemed_sale_id')
      .where('vo.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('vo.created_at'), {
        from: query.from,
        to: query.to,
      });

    const search = query.text('search');
    if (search) {
      qb.andWhere('(vo.barcode ILIKE :q OR vo.comment ILIKE :q)', {
        q: `%${search}%`,
      });
    }

    const raw = await qb
      .select(localDaySql('vo.created_at'), 'emitido')
      .addSelect('vo.barcode', 'codigo')
      .addSelect('vo.amount', 'valor')
      .addSelect('vo.status', 'estado')
      .addSelect(
        `CASE WHEN vo.expires_at IS NULL THEN '—' ELSE ${localDaySql('vo.expires_at')} END`,
        'vence',
      )
      .addSelect(
        `CASE WHEN vo.redeemed_at IS NULL THEN '—' ELSE ${localDaySql('vo.redeemed_at')} END`,
        'canjeado',
      )
      .addSelect("COALESCE(s.sale_number, '—')", 'venta')
      .addSelect("COALESCE(vo.comment, '')", 'comentario')
      .addSelect(
        'CASE WHEN vo.expires_at IS NOT NULL AND vo.expires_at < now()' +
          " AND vo.status = 'ACTIVE' THEN true ELSE false END",
        'vencido',
      )
      .orderBy('vo.created_at', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const label: Record<string, string> = {
      ACTIVE: 'Activo',
      REDEEMED: 'Canjeado',
      DISABLED: 'Anulado',
    };

    const rows = raw.map((r) => ({
      emitido: String(r.emitido ?? ''),
      codigo: String(r.codigo ?? ''),
      valor: money(r.valor),
      estado: r.vencido
        ? 'Vencido'
        : (label[String(r.estado)] ?? String(r.estado)),
      vence: String(r.vence ?? '—'),
      canjeado: String(r.canjeado ?? '—'),
      venta: String(r.venta ?? '—'),
      comentario: String(r.comentario ?? ''),
    }));

    const canjeados = rows.filter((r) => r.estado === 'Canjeado');
    const activos = rows.filter((r) => r.estado === 'Activo');

    return {
      columns: [
        { key: 'emitido', label: 'Emitido', type: 'date' },
        { key: 'codigo', label: 'Código', type: 'text' },
        { key: 'valor', label: 'Valor', type: 'money' },
        { key: 'estado', label: 'Estado', type: 'text' },
        { key: 'vence', label: 'Vence', type: 'date' },
        { key: 'canjeado', label: 'Canjeado', type: 'date' },
        { key: 'venta', label: 'Venta', type: 'text' },
        { key: 'comentario', label: 'Comentario', type: 'text' },
      ],
      rows,
      totals: [
        {
          key: 'bonos',
          label: 'Bonos emitidos',
          type: 'number',
          value: rows.length,
        },
        {
          key: 'emitido',
          label: 'Valor emitido',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.valor, 0)),
        },
        {
          key: 'canjeado',
          label: 'Valor canjeado',
          type: 'money',
          value: money(canjeados.reduce((s, r) => s + r.valor, 0)),
        },
        {
          key: 'pendiente',
          label: 'Sigue vigente',
          type: 'money',
          value: money(activos.reduce((s, r) => s + r.valor, 0)),
          hint: 'Plata que puede volver a la caja como descuento',
        },
      ],
      title: `Bonos y cupones ${query.from} a ${query.to}`,
      warnings: this.cap(raw.length, 'bonos'),
    };
  }
}
