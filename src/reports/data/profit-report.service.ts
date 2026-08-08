import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { SaleItem } from '../../pos/entities/sale-item.entity.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import {
  int,
  localDaySql,
  localDateTimeSql,
  marginPct,
  money,
  str,
  timestampRangeSql,
} from '../engine/report-filters.js';
import type {
  ReportColumn,
  ReportQuery,
  ReportResult,
  ReportTotal,
  RawRow,
} from '../engine/report-types.js';

const MAX_ROWS = 20000;

const GROUPS = [
  'linea',
  'venta',
  'dia',
  'vendedor',
  'producto',
  'categoria',
  'marca',
  'bodega',
] as const;
type Group = (typeof GROUPS)[number];

/**
 * Venta **neta**: lo que pagó el cliente menos el IVA.
 *
 * El IVA no es ingreso del negocio, es plata del Estado que pasa por la caja.
 * Comparar el total con IVA contra el costo infla la utilidad ~19%. Sirve para
 * los dos regímenes (IVA incluido en el precio o sumado encima), porque en
 * ambos `line_total − tax_amount` es la base gravable.
 */
const NET_SQL = '(si.line_total - si.tax_amount)';
const COST_SQL = '(si.unit_cost * si.quantity)';

/**
 * Ventas y utilidad.
 *
 * Un solo reporte para lo que en el sistema anterior son seis: cambiando el
 * agrupador se obtiene el detalle línea por línea, el cierre del día, el
 * desempeño por vendedor o el ranking de productos.
 *
 * **Los totales se consultan aparte de las filas**, con su propio agregado.
 * Así son exactos aunque la tabla se recorte, y el conteo de ventas no se
 * duplica cuando una venta cae en dos grupos (dos productos, dos categorías).
 */
@Injectable()
export class ProfitReportService {
  constructor(
    @InjectRepository(SaleItem)
    private readonly itemRepo: Repository<SaleItem>,
  ) {}

  private base(
    query: ReportQuery,
    tenantId: string,
  ): SelectQueryBuilder<SaleItem> {
    const qb = this.itemRepo
      .createQueryBuilder('si')
      .innerJoin('si.sale', 's')
      .innerJoin('si.variant', 'v')
      .innerJoin('v.product', 'p')
      .leftJoin('s.user', 'u')
      .leftJoin('s.client', 'cl')
      .leftJoin('s.warehouse', 'w')
      .leftJoin('p.category', 'c')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere(timestampRangeSql('s.created_at'), {
        from: query.from,
        to: query.to,
      });

    const warehouseId = query.uuid('warehouseId');
    if (warehouseId)
      qb.andWhere('s.warehouse_id = :warehouseId', { warehouseId });
    const userId = query.uuid('userId');
    if (userId) qb.andWhere('s.user_id = :userId', { userId });
    const categoryId = query.uuid('categoryId');
    if (categoryId) qb.andWhere('p.category_id = :categoryId', { categoryId });
    const brand = query.text('brand');
    if (brand) qb.andWhere('p.brand = :brand', { brand });
    const channel = query.text('channel');
    if (channel) qb.andWhere('s.sale_channel = :channel', { channel });

    const search = query.text('search');
    if (search) {
      qb.andWhere(
        '(si.product_name ILIKE :q OR si.variant_sku ILIKE :q' +
          ' OR s.sale_number ILIKE :q OR s.invoice_number ILIKE :q' +
          " OR (COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, '')) ILIKE :q)",
        { q: `%${search}%` },
      );
    }
    return qb;
  }

  async run(query: ReportQuery, tenantId: string): Promise<ReportResult> {
    const groupBy = query.pick('groupBy', GROUPS, 'linea');
    const [totals, { columns, rows, truncated }] = await Promise.all([
      this.totals(query, tenantId),
      groupBy === 'linea'
        ? this.detailRows(query, tenantId)
        : this.groupedRows(groupBy, query, tenantId),
    ]);

    const warnings: string[] = [];
    if (truncated) {
      warnings.push(
        `Se muestran las primeras ${MAX_ROWS.toLocaleString('es-CO')} filas. ` +
          `Los totales de arriba sí cubren todo el período; para ver el detalle ` +
          `completo, acota el filtro o exporta.`,
      );
    }
    if (totals.sinCosto > 0) {
      warnings.push(
        `${totals.sinCosto.toLocaleString('es-CO')} línea(s) no tienen costo ` +
          `registrado (venta de ${money(totals.ventaSinCosto).toLocaleString('es-CO')}). ` +
          `Su utilidad sale igual a la venta, así que el margen real es menor ` +
          `que el que ves.`,
      );
    }

    return {
      columns,
      rows,
      totals: this.totalTiles(totals),
      title: `Ventas y utilidad por ${groupBy} ${query.from} a ${query.to}`,
      warnings,
    };
  }

  // ── Totales exactos (independientes del recorte de filas) ────────────────

  private async totals(query: ReportQuery, tenantId: string) {
    const raw = await this.base(query, tenantId)
      .select('COUNT(DISTINCT s.id)', 'ventas')
      .addSelect('COALESCE(SUM(si.quantity), 0)', 'unidades')
      .addSelect('COALESCE(SUM(si.line_total), 0)', 'venta')
      .addSelect('COALESCE(SUM(si.tax_amount), 0)', 'iva')
      .addSelect(`COALESCE(SUM(${COST_SQL}), 0)`, 'costo')
      .addSelect('COUNT(*) FILTER (WHERE si.unit_cost = 0)', 'sinCosto')
      .addSelect(
        `COALESCE(SUM(${NET_SQL}) FILTER (WHERE si.unit_cost = 0), 0)`,
        'ventaSinCosto',
      )
      .getRawOne<RawRow>();

    const venta = money(raw?.venta);
    const iva = money(raw?.iva);
    const costo = money(raw?.costo);
    const neta = money(venta - iva);
    return {
      ventas: int(raw?.ventas),
      unidades: int(raw?.unidades),
      venta,
      iva,
      neta,
      costo,
      utilidad: money(neta - costo),
      sinCosto: int(raw?.sinCosto),
      ventaSinCosto: money(raw?.ventaSinCosto),
    };
  }

  private totalTiles(t: {
    ventas: number;
    unidades: number;
    venta: number;
    iva: number;
    neta: number;
    costo: number;
    utilidad: number;
    sinCosto: number;
  }): ReportTotal[] {
    return [
      { key: 'ventas', label: 'Ventas', type: 'number', value: t.ventas },
      { key: 'unidades', label: 'Unidades', type: 'number', value: t.unidades },
      {
        key: 'venta',
        label: 'Vendido',
        type: 'money',
        value: t.venta,
        hint: 'Lo que pagó el cliente, con IVA',
      },
      {
        key: 'neta',
        label: 'Venta sin IVA',
        type: 'money',
        value: t.neta,
        hint: 'Base con la que se calcula la utilidad',
      },
      { key: 'costo', label: 'Costo', type: 'money', value: t.costo },
      { key: 'utilidad', label: 'Utilidad', type: 'money', value: t.utilidad },
      {
        key: 'margen',
        label: 'Margen',
        type: 'percent',
        value: marginPct(t.utilidad, t.neta),
      },
      {
        key: 'ticket',
        label: 'Ticket promedio',
        type: 'money',
        value: t.ventas ? money(t.venta / t.ventas) : 0,
      },
    ];
  }

  // ── Filas ────────────────────────────────────────────────────────────────

  private async detailRows(query: ReportQuery, tenantId: string) {
    const raw = await this.base(query, tenantId)
      .select(localDateTimeSql('s.created_at'), 'fecha')
      .addSelect('s.sale_number', 'venta')
      .addSelect("COALESCE(s.invoice_number, '—')", 'factura')
      .addSelect(
        "NULLIF(TRIM(COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, '')), '')",
        'cliente',
      )
      .addSelect(
        "NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')",
        'vendedor',
      )
      .addSelect('w.name', 'bodega')
      .addSelect('s.sale_channel', 'canal')
      .addSelect('si.product_name', 'producto')
      .addSelect('si.variant_sku', 'sku')
      .addSelect('si.variant_size', 'talla')
      .addSelect('si.variant_color', 'color')
      .addSelect('si.quantity', 'cantidad')
      .addSelect('si.unit_price', 'precioUnit')
      .addSelect('si.discount_percent', 'descuento')
      .addSelect('si.line_total', 'total')
      .addSelect('si.tax_amount', 'iva')
      .addSelect('si.unit_cost', 'costoUnit')
      .orderBy('s.created_at', 'DESC')
      .addOrderBy('si.product_name', 'ASC')
      .limit(MAX_ROWS + 1)
      .getRawMany<RawRow>();

    const truncated = raw.length > MAX_ROWS;
    const columns: ReportColumn[] = [
      { key: 'fecha', label: 'Fecha', type: 'datetime' },
      { key: 'venta', label: 'Venta', type: 'text' },
      { key: 'factura', label: 'Factura', type: 'text' },
      { key: 'cliente', label: 'Cliente', type: 'text' },
      { key: 'vendedor', label: 'Vendedor', type: 'text' },
      { key: 'bodega', label: 'Bodega', type: 'text' },
      { key: 'canal', label: 'Canal', type: 'text' },
      { key: 'producto', label: 'Producto', type: 'text' },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'talla', label: 'Talla', type: 'text' },
      { key: 'color', label: 'Color', type: 'text' },
      { key: 'cantidad', label: 'Cant.', type: 'number' },
      { key: 'precioUnit', label: 'Precio unit.', type: 'money' },
      { key: 'descuento', label: 'Desc.', type: 'percent' },
      { key: 'total', label: 'Vendido', type: 'money' },
      { key: 'iva', label: 'IVA', type: 'money' },
      { key: 'neta', label: 'Sin IVA', type: 'money' },
      { key: 'costoUnit', label: 'Costo unit.', type: 'money' },
      { key: 'costo', label: 'Costo total', type: 'money' },
      { key: 'utilidad', label: 'Utilidad', type: 'money' },
      { key: 'margen', label: 'Margen', type: 'percent' },
    ];

    const rows = raw.slice(0, MAX_ROWS).map((r) => {
      const cantidad = int(r.cantidad);
      const total = money(r.total);
      const iva = money(r.iva);
      const neta = money(total - iva);
      const costoUnit = money(r.costoUnit);
      const costo = money(costoUnit * cantidad);
      return {
        fecha: String(r.fecha ?? ''),
        venta: String(r.venta ?? ''),
        factura: String(r.factura ?? ''),
        cliente: str(r.cliente, 'Consumidor final'),
        vendedor: str(r.vendedor, '—'),
        bodega: String(r.bodega ?? ''),
        canal: String(r.canal ?? ''),
        producto: String(r.producto ?? ''),
        sku: String(r.sku ?? ''),
        talla: String(r.talla ?? ''),
        color: String(r.color ?? ''),
        cantidad,
        precioUnit: money(r.precioUnit),
        descuento: money(r.descuento),
        total,
        iva,
        neta,
        costoUnit,
        costo,
        utilidad: money(neta - costo),
        margen: marginPct(neta - costo, neta),
      };
    });

    return { columns, rows, truncated };
  }

  private async groupedRows(
    groupBy: Exclude<Group, 'linea'>,
    query: ReportQuery,
    tenantId: string,
  ) {
    const dims: Record<
      Exclude<Group, 'linea'>,
      {
        sql: string;
        label: string;
        order?: { sql: string; dir: 'ASC' | 'DESC' };
      }
    > = {
      venta: {
        sql: 's.sale_number',
        label: 'Venta',
        // Lo más reciente primero. Va con MIN() porque la fecha no está en el
        // GROUP BY; sin la agregación Postgres rechaza la consulta.
        order: { sql: 'MIN(s.created_at)', dir: 'DESC' },
      },
      dia: {
        sql: localDaySql('s.created_at'),
        label: 'Día',
        order: { sql: localDaySql('s.created_at'), dir: 'DESC' },
      },
      vendedor: {
        sql: "NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')",
        label: 'Vendedor',
      },
      producto: { sql: 'si.product_name', label: 'Producto' },
      categoria: {
        sql: "COALESCE(c.name, 'Sin categoría')",
        label: 'Categoría',
      },
      marca: {
        sql: "COALESCE(NULLIF(p.brand, ''), 'Sin marca')",
        label: 'Marca',
      },
      bodega: { sql: 'w.name', label: 'Bodega' },
    };
    const d = dims[groupBy];

    const qb = this.base(query, tenantId)
      .select(d.sql, 'grupo')
      .addSelect('COUNT(DISTINCT s.id)', 'ventas')
      .addSelect('COALESCE(SUM(si.quantity), 0)', 'unidades')
      .addSelect('COALESCE(SUM(si.line_total), 0)', 'total')
      .addSelect('COALESCE(SUM(si.tax_amount), 0)', 'iva')
      .addSelect(`COALESCE(SUM(${COST_SQL}), 0)`, 'costo')
      .addSelect('COUNT(*) FILTER (WHERE si.unit_cost = 0)', 'sinCosto')
      .groupBy(d.sql);

    if (d.order) qb.orderBy(d.order.sql, d.order.dir);
    else qb.orderBy('"total"', 'DESC');

    const raw = await qb.limit(MAX_ROWS + 1).getRawMany<RawRow>();
    const truncated = raw.length > MAX_ROWS;

    const columns: ReportColumn[] = [
      { key: 'grupo', label: d.label, type: 'text' },
      { key: 'ventas', label: 'Ventas', type: 'number' },
      { key: 'unidades', label: 'Unidades', type: 'number' },
      { key: 'total', label: 'Vendido', type: 'money' },
      { key: 'iva', label: 'IVA', type: 'money' },
      { key: 'neta', label: 'Sin IVA', type: 'money' },
      { key: 'costo', label: 'Costo', type: 'money' },
      { key: 'utilidad', label: 'Utilidad', type: 'money' },
      { key: 'margen', label: 'Margen', type: 'percent' },
      {
        key: 'sinCosto',
        label: 'Líneas sin costo',
        type: 'number',
        hint: 'Su utilidad sale igual a la venta: revisa el costo del producto',
      },
    ];

    const rows = raw.slice(0, MAX_ROWS).map((r) => {
      const total = money(r.total);
      const iva = money(r.iva);
      const neta = money(total - iva);
      const costo = money(r.costo);
      return {
        grupo: str(r.grupo, '—'),
        ventas: int(r.ventas),
        unidades: int(r.unidades),
        total,
        iva,
        neta,
        costo,
        utilidad: money(neta - costo),
        margen: marginPct(neta - costo, neta),
        sinCosto: int(r.sinCosto),
      };
    });

    return { columns, rows, truncated };
  }
}
