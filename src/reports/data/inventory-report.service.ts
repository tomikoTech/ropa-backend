import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from '../../inventory/entities/stock.entity.js';
import { StockUnit } from '../../inventory/entities/stock-unit.entity.js';
import { int, money, str } from '../engine/report-filters.js';
import type {
  ReportColumn,
  ReportQuery,
  ReportResult,
  RawRow,
} from '../engine/report-types.js';

/** Filas máximas por consulta. Más que esto no se lee: se acota o se exporta. */
const MAX_ROWS = 20000;

const GROUPS = [
  'variante',
  'producto',
  'bodega',
  'categoria',
  'marca',
  'ubicacion',
] as const;
type Group = (typeof GROUPS)[number];

const SIN_CATEGORIA = 'Sin categoría';
const SIN_MARCA = 'Sin marca';

/**
 * Reporte de Inventario: qué hay, dónde y cuánto vale.
 *
 * Absorbe los cinco reportes de inventario del sistema anterior cambiando el
 * **agrupador**, no la página: el mismo filtro sirve para ver referencia por
 * referencia o el total por bodega.
 *
 * Las consultas van en crudo (`getRawMany`) a propósito: hidratar entidades
 * para sumar cantidades carga miles de objetos que no se usan.
 */
@Injectable()
export class InventoryReportService {
  constructor(
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(StockUnit)
    private readonly unitRepo: Repository<StockUnit>,
  ) {}

  async run(query: ReportQuery, tenantId: string): Promise<ReportResult> {
    const groupBy = query.pick('groupBy', GROUPS, 'variante');
    if (groupBy === 'ubicacion') return this.byLocation(query, tenantId);
    return this.fromStock(groupBy, query, tenantId);
  }

  /** Filtros comunes sobre el inventario agregado. */
  private baseQuery(query: ReportQuery, tenantId: string) {
    const qb = this.stockRepo
      .createQueryBuilder('st')
      .innerJoin('st.variant', 'v')
      .innerJoin('v.product', 'p')
      .innerJoin('st.warehouse', 'w')
      .leftJoin('p.category', 'c')
      .leftJoin('v.sizeRef', 'sz')
      .leftJoin('v.colorRef', 'co')
      .where('st.tenant_id = :tenantId', { tenantId });

    // Por defecto no se muestran los ceros: son ruido en una bodega grande.
    if (!query.flag('includeZero')) qb.andWhere('st.quantity > 0');
    if (query.flag('onlyLowStock')) {
      qb.andWhere('st.quantity <= st.min_stock');
    }

    const warehouseId = query.uuid('warehouseId');
    if (warehouseId)
      qb.andWhere('st.warehouse_id = :warehouseId', { warehouseId });

    const categoryId = query.uuid('categoryId');
    if (categoryId) qb.andWhere('p.category_id = :categoryId', { categoryId });

    const sizeId = query.uuid('sizeId');
    if (sizeId) qb.andWhere('v.size_id = :sizeId', { sizeId });

    const colorId = query.uuid('colorId');
    if (colorId) qb.andWhere('v.color_id = :colorId', { colorId });

    const brand = query.text('brand');
    if (brand) qb.andWhere('p.brand = :brand', { brand });

    const search = query.text('search');
    if (search) {
      qb.andWhere('(p.name ILIKE :q OR v.sku ILIKE :q OR v.barcode ILIKE :q)', {
        q: `%${search}%`,
      });
    }
    return qb;
  }

  /** Expresión del precio de venta vigente de la referencia. */
  private readonly priceSql = 'COALESCE(v.price_override, p.base_price)';

  private async fromStock(
    groupBy: Exclude<Group, 'ubicacion'>,
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.baseQuery(query, tenantId);

    const costValue = 'SUM(st.quantity * p.cost_price)';
    const retailValue = `SUM(st.quantity * ${this.priceSql})`;

    let columns: ReportColumn[];

    if (groupBy === 'variante') {
      columns = [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'producto', label: 'Producto', type: 'text' },
        { key: 'marca', label: 'Marca', type: 'text' },
        { key: 'categoria', label: 'Categoría', type: 'text' },
        { key: 'talla', label: 'Talla', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
        { key: 'bodega', label: 'Bodega', type: 'text' },
        { key: 'cantidad', label: 'Cantidad', type: 'number' },
        { key: 'paresSueltos', label: 'Pares sueltos', type: 'number', hint: 'No están dentro de una caja cerrada' },
        { key: 'paresEnCajas', label: 'Pares en cajas', type: 'number', hint: 'Pares dentro de cajas cerradas; la caja puede contener tallas mixtas' },
        { key: 'cajasCerradas', label: 'Cajas', type: 'number' },
        { key: 'minimo', label: 'Mínimo', type: 'number' },
        { key: 'costoUnit', label: 'Costo unit.', type: 'money' },
        { key: 'precio', label: 'Precio venta', type: 'money' },
        { key: 'valorCosto', label: 'Valor costo', type: 'money' },
        { key: 'valorVenta', label: 'Valor venta', type: 'money' },
      ];
      qb.select('v.sku', 'sku')
        .addSelect('p.name', 'producto')
        .addSelect('p.brand', 'marca')
        .addSelect('c.name', 'categoria')
        .addSelect('sz.name', 'talla')
        .addSelect('co.name', 'color')
        .addSelect('w.name', 'bodega')
        .addSelect('st.quantity', 'cantidad')
        .addSelect(`GREATEST(0, st.quantity - (
          SELECT COALESCE(SUM(u.quantity), 0)
          FROM stock_units u
          WHERE u.tenant_id = :tenantId
            AND u.variant_id = v.id
            AND u.warehouse_id = st.warehouse_id
            AND u.kind = 'BOX'
            AND u.status = 'IN_STOCK'
        ))`, 'paresSueltos')
        .addSelect(`(
          SELECT COALESCE(SUM(u.quantity), 0)
          FROM stock_units u
          WHERE u.tenant_id = :tenantId
            AND u.variant_id = v.id
            AND u.warehouse_id = st.warehouse_id
            AND u.kind = 'BOX'
            AND u.status = 'IN_STOCK'
        )`, 'paresEnCajas')
        .addSelect(`(
          SELECT COUNT(*)
          FROM stock_units u
          WHERE u.tenant_id = :tenantId
            AND u.variant_id = v.id
            AND u.warehouse_id = st.warehouse_id
            AND u.kind = 'BOX'
            AND u.status = 'IN_STOCK'
        )`, 'cajasCerradas')
        .addSelect('st.min_stock', 'minimo')
        .addSelect('p.cost_price', 'costoUnit')
        .addSelect(this.priceSql, 'precio')
        .orderBy('p.name', 'ASC')
        .addOrderBy('sz.sort_order', 'ASC')
        .addOrderBy('co.name', 'ASC');
    } else {
      const dim: Record<
        Exclude<Group, 'ubicacion' | 'variante'>,
        { sql: string; label: string; fallback?: string }
      > = {
        producto: { sql: 'p.name', label: 'Producto' },
        bodega: { sql: 'w.name', label: 'Bodega' },
        categoria: {
          sql: `COALESCE(c.name, '${SIN_CATEGORIA}')`,
          label: 'Categoría',
        },
        marca: {
          sql: `COALESCE(NULLIF(p.brand, ''), '${SIN_MARCA}')`,
          label: 'Marca',
        },
      };
      const d = dim[groupBy];
      columns = [
        { key: 'grupo', label: d.label, type: 'text' },
        {
          key: 'referencias',
          label: 'Referencias',
          type: 'number',
          hint: 'Combinaciones distintas de talla y color',
        },
        { key: 'cantidad', label: 'Unidades', type: 'number' },
        { key: 'paresSueltos', label: 'Pares sueltos', type: 'number' },
        { key: 'paresEnCajas', label: 'Pares en cajas', type: 'number' },
        { key: 'cajasCerradas', label: 'Cajas cerradas', type: 'number' },
        { key: 'valorCosto', label: 'Valor costo', type: 'money' },
        { key: 'valorVenta', label: 'Valor venta', type: 'money' },
      ];
      qb.select(d.sql, 'grupo')
        .addSelect('COUNT(DISTINCT v.id)', 'referencias')
        .addSelect('COALESCE(SUM(st.quantity), 0)', 'cantidad')
        .addSelect(`COALESCE(SUM(GREATEST(0, st.quantity - (
          SELECT COALESCE(SUM(u.quantity), 0)
          FROM stock_units u
          WHERE u.tenant_id = :tenantId
            AND u.variant_id = v.id
            AND u.warehouse_id = st.warehouse_id
            AND u.kind = 'BOX'
            AND u.status = 'IN_STOCK'
        ))), 0)`, 'paresSueltos')
        .addSelect(`COALESCE(SUM((
          SELECT COALESCE(SUM(u.quantity), 0)
          FROM stock_units u
          WHERE u.tenant_id = :tenantId
            AND u.variant_id = v.id
            AND u.warehouse_id = st.warehouse_id
            AND u.kind = 'BOX'
            AND u.status = 'IN_STOCK'
        )), 0)`, 'paresEnCajas')
        .addSelect(`COALESCE(SUM((
          SELECT COUNT(*)
          FROM stock_units u
          WHERE u.tenant_id = :tenantId
            AND u.variant_id = v.id
            AND u.warehouse_id = st.warehouse_id
            AND u.kind = 'BOX'
            AND u.status = 'IN_STOCK'
        )), 0)`, 'cajasCerradas')
        .addSelect(`COALESCE(${costValue}, 0)`, 'valorCosto')
        .addSelect(`COALESCE(${retailValue}, 0)`, 'valorVenta')
        .groupBy(d.sql)
        .orderBy('"valorCosto"', 'DESC');
    }

    const raw = await qb.limit(MAX_ROWS).getRawMany<RawRow>();

    // El tipo de la fila se anota aquí porque las dos ramas devuelven columnas
    // distintas: sin la anotación TypeScript infiere una unión con claves
    // opcionales que no encaja en el contrato del reporte.
    const rows: ReportResult['rows'] = raw.map(
      (r): ReportResult['rows'][number] => {
        if (groupBy !== 'variante') {
          return {
            grupo: String(r.grupo ?? ''),
            referencias: int(r.referencias),
            cantidad: int(r.cantidad),
            paresSueltos: int(r.paresSueltos),
            paresEnCajas: int(r.paresEnCajas),
            cajasCerradas: int(r.cajasCerradas),
            valorCosto: money(r.valorCosto),
            valorVenta: money(r.valorVenta),
          };
        }
        const cantidad = int(r.cantidad);
        const paresSueltos = int(r.paresSueltos);
        const paresEnCajas = int(r.paresEnCajas);
        const cajasCerradas = int(r.cajasCerradas);
        const costoUnit = money(r.costoUnit);
        const precio = money(r.precio);
        return {
          sku: String(r.sku ?? ''),
          producto: String(r.producto ?? ''),
          marca: str(r.marca, SIN_MARCA),
          categoria: str(r.categoria, SIN_CATEGORIA),
          talla: str(r.talla, '—'),
          color: str(r.color, '—'),
          bodega: String(r.bodega ?? ''),
          cantidad,
          paresSueltos,
          paresEnCajas,
          cajasCerradas,
          minimo: int(r.minimo),
          costoUnit,
          precio,
          valorCosto: money(cantidad * costoUnit),
          valorVenta: money(cantidad * precio),
        };
      },
    );

    const unidades = rows.reduce((s, r) => s + Number(r.cantidad), 0);
    const paresSueltos = rows.reduce((s, r) => s + Number(r.paresSueltos ?? 0), 0);
    const paresEnCajas = rows.reduce((s, r) => s + Number(r.paresEnCajas ?? 0), 0);
    const cajasCerradas = rows.reduce((s, r) => s + Number(r.cajasCerradas ?? 0), 0);
    const valorCosto = money(
      rows.reduce((s, r) => s + Number(r.valorCosto), 0),
    );
    const valorVenta = money(
      rows.reduce((s, r) => s + Number(r.valorVenta), 0),
    );

    const warnings: string[] = [];
    if (raw.length >= MAX_ROWS) {
      warnings.push(
        `El reporte se cortó en ${MAX_ROWS.toLocaleString('es-CO')} filas, así que ` +
          `los totales solo cubren esas. Acota los filtros o agrupa para verlo completo.`,
      );
    }

    return {
      columns,
      rows,
      totals: [
        { key: 'unidades', label: 'Unidades', type: 'number', value: unidades },
        { key: 'paresSueltos', label: 'Pares sueltos', type: 'number', value: paresSueltos },
        { key: 'paresEnCajas', label: 'Pares en cajas', type: 'number', value: paresEnCajas },
        { key: 'cajasCerradas', label: 'Cajas cerradas', type: 'number', value: cajasCerradas },
        {
          key: 'valorCosto',
          label: 'Valor al costo',
          type: 'money',
          value: valorCosto,
        },
        {
          key: 'valorVenta',
          label: 'Valor a precio de venta',
          type: 'money',
          value: valorVenta,
        },
        {
          key: 'filas',
          label: groupBy === 'variante' ? 'Referencias' : 'Grupos',
          type: 'number',
          value: rows.length,
        },
      ],
      title: `Inventario por ${groupBy}`,
      warnings,
    };
  }

  /**
   * Ubicación física: solo existe para los bultos etiquetados (los que tienen
   * código de barras propio). El inventario suelto no vive en un stand, así
   * que aquí no aparece — y el aviso lo dice, en vez de mostrar una tabla
   * vacía sin explicación.
   */
  private async byLocation(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.unitRepo
      .createQueryBuilder('u')
      .innerJoin('u.product', 'p')
      .innerJoin('u.warehouse', 'w')
      .leftJoin('u.stand', 'sd')
      .leftJoin('sd.shelf', 'sh')
      .leftJoin('u.size', 'sz')
      .leftJoin('u.color', 'co')
      .leftJoin('p.category', 'c')
      .where('u.tenant_id = :tenantId', { tenantId })
      .andWhere("u.status = 'IN_STOCK'");

    const warehouseId = query.uuid('warehouseId');
    if (warehouseId)
      qb.andWhere('u.warehouse_id = :warehouseId', { warehouseId });
    const categoryId = query.uuid('categoryId');
    if (categoryId) qb.andWhere('p.category_id = :categoryId', { categoryId });
    const sizeId = query.uuid('sizeId');
    if (sizeId) qb.andWhere('u.size_id = :sizeId', { sizeId });
    const colorId = query.uuid('colorId');
    if (colorId) qb.andWhere('u.color_id = :colorId', { colorId });
    const brand = query.text('brand');
    if (brand) qb.andWhere('p.brand = :brand', { brand });
    const search = query.text('search');
    if (search) {
      qb.andWhere('(p.name ILIKE :q OR u.barcode ILIKE :q)', {
        q: `%${search}%`,
      });
    }

    const raw = await qb
      .select('w.name', 'bodega')
      .addSelect("COALESCE(sh.name, '—')", 'estanteria')
      .addSelect("COALESCE(sd.name, 'Sin ubicar')", 'stand')
      .addSelect('u.barcode', 'codigo')
      .addSelect('u.kind', 'tipo')
      .addSelect('p.name', 'producto')
      .addSelect("COALESCE(sz.name, '—')", 'talla')
      .addSelect("COALESCE(co.name, '—')", 'color')
      .addSelect('u.quantity', 'unidades')
      .addSelect('u.cost', 'costoUnit')
      .orderBy('w.name', 'ASC')
      .addOrderBy('sh.name', 'ASC')
      .addOrderBy('sd.name', 'ASC')
      .addOrderBy('u.barcode', 'ASC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const rows = raw.map((r) => {
      const unidades = int(r.unidades);
      const costoUnit = money(r.costoUnit);
      return {
        bodega: String(r.bodega ?? ''),
        estanteria: String(r.estanteria ?? ''),
        stand: String(r.stand ?? ''),
        codigo: String(r.codigo ?? ''),
        tipo: r.tipo === 'BOX' ? 'Caja' : 'Unidad',
        producto: String(r.producto ?? ''),
        talla: r.tipo === 'BOX' ? 'Tallas mixtas' : String(r.talla ?? ''),
        color: String(r.color ?? ''),
        unidades,
        costoUnit,
        valorCosto: money(unidades * costoUnit),
      };
    });

    const cajas = raw.filter((r) => r.tipo === 'BOX').length;
    const warnings = rows.length
      ? []
      : [
          'No hay cajas ni pares etiquetados. La ubicación por estantería y stand solo ' +
            'aplica al inventario que se maneja por cajas con código propio ' +
            '(se activa por producto). El resto del inventario se ve agrupado ' +
            'por bodega.',
        ];

    return {
      columns: [
        { key: 'bodega', label: 'Bodega', type: 'text' },
        { key: 'estanteria', label: 'Estantería', type: 'text' },
        { key: 'stand', label: 'Stand', type: 'text' },
        { key: 'codigo', label: 'Código', type: 'text' },
        { key: 'tipo', label: 'Tipo', type: 'text' },
        { key: 'producto', label: 'Producto', type: 'text' },
        { key: 'talla', label: 'Talla', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
        { key: 'unidades', label: 'Unidades', type: 'number' },
        { key: 'costoUnit', label: 'Costo unit.', type: 'money' },
        { key: 'valorCosto', label: 'Valor costo', type: 'money' },
      ],
      rows,
      totals: [
        { key: 'bultos', label: 'Cajas y pares', type: 'number', value: rows.length },
        { key: 'cajas', label: 'Cajas cerradas', type: 'number', value: cajas },
        {
          key: 'unidades',
          label: 'Unidades',
          type: 'number',
          value: rows.reduce((s, r) => s + Number(r.unidades), 0),
        },
        {
          key: 'valorCosto',
          label: 'Valor al costo',
          type: 'money',
          value: money(rows.reduce((s, r) => s + Number(r.valorCosto), 0)),
        },
      ],
      title: 'Inventario por ubicación física',
      warnings,
    };
  }
}
