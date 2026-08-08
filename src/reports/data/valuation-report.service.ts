import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from '../../inventory/entities/stock.entity.js';
import { StockMovement } from '../../inventory/entities/stock-movement.entity.js';
import {
  int,
  localDaySql,
  marginPct,
  money,
  timestampRangeSql,
} from '../engine/report-filters.js';
import type {
  RawRow,
  ReportQuery,
  ReportResult,
} from '../engine/report-types.js';

const MAX_ROWS = 20000;
const MODES = ['existencias', 'ingresos'] as const;

/**
 * Valorización: el costo contra el precio.
 *
 * En modo **existencias** responde "cuánto tengo metido y cuánto vale eso si
 * lo vendo" referencia por referencia, que es el reporte que el dueño mira
 * antes de comprar más. En modo **ingresos**, qué entró en el período.
 */
@Injectable()
export class ValuationReportService {
  constructor(
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
  ) {}

  run(query: ReportQuery, tenantId: string): Promise<ReportResult> {
    const mode = query.pick('mode', MODES, 'existencias');
    return mode === 'ingresos'
      ? this.intake(query, tenantId)
      : this.onHand(query, tenantId);
  }

  private async onHand(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const priceSql = 'COALESCE(v.price_override, p.base_price)';
    const qb = this.stockRepo
      .createQueryBuilder('st')
      .innerJoin('st.variant', 'v')
      .innerJoin('v.product', 'p')
      .innerJoin('st.warehouse', 'w')
      .leftJoin('p.category', 'c')
      .leftJoin('v.sizeRef', 'sz')
      .leftJoin('v.colorRef', 'co')
      .where('st.tenant_id = :tenantId', { tenantId })
      .andWhere('st.quantity > 0');

    const warehouseId = query.uuid('warehouseId');
    if (warehouseId)
      qb.andWhere('st.warehouse_id = :warehouseId', { warehouseId });
    const categoryId = query.uuid('categoryId');
    if (categoryId) qb.andWhere('p.category_id = :categoryId', { categoryId });
    const brand = query.text('brand');
    if (brand) qb.andWhere('p.brand = :brand', { brand });
    const search = query.text('search');
    if (search) {
      qb.andWhere('(p.name ILIKE :q OR v.sku ILIKE :q OR v.barcode ILIKE :q)', {
        q: `%${search}%`,
      });
    }

    const raw = await qb
      .select('v.sku', 'sku')
      .addSelect('p.name', 'producto')
      .addSelect("COALESCE(c.name, 'Sin categoría')", 'categoria')
      .addSelect("COALESCE(sz.name, '—')", 'talla')
      .addSelect("COALESCE(co.name, '—')", 'color')
      .addSelect('w.name', 'bodega')
      .addSelect('st.quantity', 'cantidad')
      .addSelect('p.cost_price', 'costoUnit')
      .addSelect(priceSql, 'precio')
      .orderBy('p.name', 'ASC')
      .addOrderBy('sz.sort_order', 'ASC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    let sinCosto = 0;
    let bajoCosto = 0;

    const rows = raw.map((r) => {
      const cantidad = int(r.cantidad);
      const costoUnit = money(r.costoUnit);
      const precio = money(r.precio);
      if (costoUnit === 0) sinCosto += 1;
      if (costoUnit > 0 && precio < costoUnit) bajoCosto += 1;
      const valorCosto = money(cantidad * costoUnit);
      const valorVenta = money(cantidad * precio);
      return {
        sku: String(r.sku ?? ''),
        producto: String(r.producto ?? ''),
        categoria: String(r.categoria ?? ''),
        talla: String(r.talla ?? ''),
        color: String(r.color ?? ''),
        bodega: String(r.bodega ?? ''),
        cantidad,
        costoUnit,
        precio,
        diferenciaUnit: money(precio - costoUnit),
        valorCosto,
        valorVenta,
        utilidad: money(valorVenta - valorCosto),
        margen: marginPct(valorVenta - valorCosto, valorVenta),
      };
    });

    const valorCosto = money(rows.reduce((s, r) => s + r.valorCosto, 0));
    const valorVenta = money(rows.reduce((s, r) => s + r.valorVenta, 0));

    const warnings: string[] = [];
    if (sinCosto) {
      warnings.push(
        `${sinCosto} referencia(s) tienen costo 0: la utilidad de esas líneas ` +
          `sale igual al precio. Corrige el costo del producto para que el ` +
          `número sirva.`,
      );
    }
    if (bajoCosto) {
      warnings.push(
        `${bajoCosto} referencia(s) tienen precio de venta por debajo del ` +
          `costo: se venderían con pérdida.`,
      );
    }
    if (raw.length >= MAX_ROWS) {
      warnings.push(
        `El reporte se cortó en ${MAX_ROWS.toLocaleString('es-CO')} filas y los ` +
          `totales solo cubren esas. Acota los filtros.`,
      );
    }

    return {
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'producto', label: 'Producto', type: 'text' },
        { key: 'categoria', label: 'Categoría', type: 'text' },
        { key: 'talla', label: 'Talla', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
        { key: 'bodega', label: 'Bodega', type: 'text' },
        { key: 'cantidad', label: 'Cantidad', type: 'number' },
        { key: 'costoUnit', label: 'Costo unit.', type: 'money' },
        { key: 'precio', label: 'Precio venta', type: 'money' },
        {
          key: 'diferenciaUnit',
          label: 'Diferencia unit.',
          type: 'money',
          hint: 'Precio de venta menos costo, por unidad',
        },
        { key: 'valorCosto', label: 'Valor costo', type: 'money' },
        { key: 'valorVenta', label: 'Valor venta', type: 'money' },
        { key: 'utilidad', label: 'Utilidad potencial', type: 'money' },
        { key: 'margen', label: 'Margen', type: 'percent' },
      ],
      rows,
      totals: [
        {
          key: 'valorCosto',
          label: 'Costo del inventario',
          type: 'money',
          value: valorCosto,
        },
        {
          key: 'valorVenta',
          label: 'Si se vende todo',
          type: 'money',
          value: valorVenta,
        },
        {
          key: 'utilidad',
          label: 'Utilidad potencial',
          type: 'money',
          value: money(valorVenta - valorCosto),
        },
        {
          key: 'margen',
          label: 'Margen',
          type: 'percent',
          value: marginPct(valorVenta - valorCosto, valorVenta),
        },
      ],
      title: 'Costo de inventario',
      warnings,
    };
  }

  /** Lo que ENTRÓ a inventario en el período (compras, ajustes positivos). */
  private async intake(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .innerJoin('m.variant', 'v')
      .innerJoin('v.product', 'p')
      .innerJoin('m.warehouse', 'w')
      .leftJoin('p.category', 'c')
      .leftJoin('v.sizeRef', 'sz')
      .leftJoin('v.colorRef', 'co')
      .leftJoin('m.createdBy', 'u')
      .where('m.tenant_id = :tenantId', { tenantId })
      // Solo entradas: un IN es mercancía que llegó; un ADJUSTMENT positivo es
      // un ajuste al alza, que también suma inventario.
      .andWhere(
        "(m.movement_type = 'IN' OR (m.movement_type = 'ADJUSTMENT' AND m.quantity > 0))",
      )
      .andWhere(timestampRangeSql('m.created_at'), {
        from: query.from,
        to: query.to,
      });

    const warehouseId = query.uuid('warehouseId');
    if (warehouseId)
      qb.andWhere('m.warehouse_id = :warehouseId', { warehouseId });
    const categoryId = query.uuid('categoryId');
    if (categoryId) qb.andWhere('p.category_id = :categoryId', { categoryId });
    const brand = query.text('brand');
    if (brand) qb.andWhere('p.brand = :brand', { brand });
    const search = query.text('search');
    if (search) {
      qb.andWhere('(p.name ILIKE :q OR v.sku ILIKE :q OR m.notes ILIKE :q)', {
        q: `%${search}%`,
      });
    }

    const raw = await qb
      .select(localDaySql('m.created_at'), 'fecha')
      .addSelect('w.name', 'bodega')
      .addSelect('p.name', 'producto')
      .addSelect('v.sku', 'sku')
      .addSelect("COALESCE(sz.name, '—')", 'talla')
      .addSelect("COALESCE(co.name, '—')", 'color')
      .addSelect('m.quantity', 'cantidad')
      .addSelect('m.movement_type', 'tipo')
      .addSelect("COALESCE(m.reference_type, '—')", 'origen')
      .addSelect("COALESCE(m.notes, '')", 'nota')
      .addSelect("COALESCE(u.first_name || ' ' || u.last_name, '—')", 'usuario')
      .addSelect('p.cost_price', 'costoUnit')
      .orderBy(localDaySql('m.created_at'), 'DESC')
      .addOrderBy('p.name', 'ASC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const rows = raw.map((r) => {
      const cantidad = int(r.cantidad);
      const costoUnit = money(r.costoUnit);
      return {
        fecha: String(r.fecha ?? ''),
        bodega: String(r.bodega ?? ''),
        producto: String(r.producto ?? ''),
        sku: String(r.sku ?? ''),
        talla: String(r.talla ?? ''),
        color: String(r.color ?? ''),
        cantidad,
        tipo: r.tipo === 'IN' ? 'Entrada' : 'Ajuste +',
        origen: r.origen === 'PURCHASE' ? 'Compra' : String(r.origen ?? ''),
        usuario: String(r.usuario ?? ''),
        nota: String(r.nota ?? ''),
        costoUnit,
        valorCosto: money(cantidad * costoUnit),
      };
    });

    return {
      columns: [
        { key: 'fecha', label: 'Fecha', type: 'date' },
        { key: 'bodega', label: 'Bodega', type: 'text' },
        { key: 'producto', label: 'Producto', type: 'text' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'talla', label: 'Talla', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
        { key: 'cantidad', label: 'Unidades', type: 'number' },
        { key: 'tipo', label: 'Tipo', type: 'text' },
        { key: 'origen', label: 'Origen', type: 'text' },
        { key: 'usuario', label: 'Registró', type: 'text' },
        { key: 'nota', label: 'Nota', type: 'text' },
        {
          key: 'costoUnit',
          label: 'Costo unit.',
          type: 'money',
          hint: 'Costo actual del producto (el movimiento no guarda el de entonces)',
        },
        { key: 'valorCosto', label: 'Valor', type: 'money' },
      ],
      rows,
      totals: [
        {
          key: 'unidades',
          label: 'Unidades ingresadas',
          type: 'number',
          value: rows.reduce((s, r) => s + r.cantidad, 0),
        },
        {
          key: 'valorCosto',
          label: 'Valor al costo',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.valorCosto, 0)),
          hint: 'Estimado con el costo actual del producto',
        },
        {
          key: 'movimientos',
          label: 'Movimientos',
          type: 'number',
          value: rows.length,
        },
      ],
      title: `Ingresos a inventario ${query.from} a ${query.to}`,
      warnings:
        raw.length >= MAX_ROWS
          ? [
              `Se cortó en ${MAX_ROWS.toLocaleString('es-CO')} movimientos; los ` +
                `totales solo cubren esos.`,
            ]
          : [],
    };
  }
}
