import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SaleItem } from '../../pos/entities/sale-item.entity.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import {
  int,
  localDateTimeSql,
  money,
  str,
  timestampRangeSql,
} from '../engine/report-filters.js';
import type {
  ReportColumn,
  ReportQuery,
  ReportResult,
  RawRow,
} from '../engine/report-types.js';

const MAX_ROWS = 20000;
const MODES = ['debajo', 'encima', 'perdida', 'descuentos'] as const;
const REFERENCES = ['base', 'mayorista'] as const;

/** Precio efectivamente cobrado por unidad, ya con el descuento aplicado. */
const NET_UNIT_SQL = '(si.unit_price * (1 - si.discount_percent / 100))';
/** Lo que quedó de la línea sin IVA (con qué se compara el costo). */
const NET_LINE_SQL = '(si.line_total - si.tax_amount)';

/**
 * Control de precios: dónde se está regalando (o subiendo) mercancía.
 *
 * El sistema anterior tiene tres reportes casi idénticos para esto (por
 * debajo, por encima y con pérdida) más el de descuentos. Aquí es el mismo
 * reporte con el modo cambiado.
 *
 * Aviso importante que el reporte lleva escrito: la referencia es el precio de
 * HOY. No hay snapshot del precio de lista al momento de la venta (sí del
 * precio cobrado), así que si el precio subió después, toda venta anterior
 * aparece "por debajo". Se dice en pantalla en vez de dejar que alguien saque
 * conclusiones sobre su cajero.
 */
@Injectable()
export class PriceControlReportService {
  constructor(
    @InjectRepository(SaleItem)
    private readonly itemRepo: Repository<SaleItem>,
  ) {}

  async run(query: ReportQuery, tenantId: string): Promise<ReportResult> {
    const mode = query.pick('mode', MODES, 'debajo');
    const reference = query.pick('reference', REFERENCES, 'base');

    const refSql =
      reference === 'mayorista'
        ? 'p.wholesale_price'
        : 'COALESCE(v.price_override, p.base_price)';

    const qb = this.itemRepo
      .createQueryBuilder('si')
      .innerJoin('si.sale', 's')
      .innerJoin('si.variant', 'v')
      .innerJoin('v.product', 'p')
      .leftJoin('s.user', 'u')
      .leftJoin('s.client', 'cl')
      .leftJoin('s.warehouse', 'w')
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
    const search = query.text('search');
    if (search) {
      qb.andWhere(
        '(si.product_name ILIKE :q OR si.variant_sku ILIKE :q' +
          ' OR s.sale_number ILIKE :q OR s.invoice_number ILIKE :q' +
          " OR (COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, '')) ILIKE :q)",
        { q: `%${search}%` },
      );
    }

    const warnings: string[] = [];

    switch (mode) {
      case 'debajo':
        // `> 0` descarta los productos sin precio de referencia: sin referencia
        // no hay "por debajo" que reportar, solo un dato faltante.
        qb.andWhere(`${refSql} > 0`).andWhere(`${NET_UNIT_SQL} < ${refSql}`);
        break;
      case 'encima':
        qb.andWhere(`${refSql} > 0`).andWhere(`${NET_UNIT_SQL} > ${refSql}`);
        break;
      case 'perdida':
        // Sin costo registrado no se puede afirmar que hubo pérdida.
        qb.andWhere('si.unit_cost > 0').andWhere(
          `${NET_LINE_SQL} < (si.unit_cost * si.quantity)`,
        );
        break;
      case 'descuentos':
        qb.andWhere('si.discount_percent > 0');
        break;
    }

    if ((mode === 'debajo' || mode === 'encima') && reference === 'mayorista') {
      warnings.push(
        'Solo aparecen los productos que tienen precio por mayor definido: ' +
          'los demás no tienen con qué comparar.',
      );
    }
    if (mode === 'debajo' || mode === 'encima') {
      warnings.push(
        'La comparación usa el precio de HOY. Si el precio cambió después de ' +
          'la venta, la diferencia refleja ese cambio y no una decisión del ' +
          'vendedor.',
      );
    }

    const raw = await qb
      .select(localDateTimeSql('s.created_at'), 'fecha')
      .addSelect('s.sale_number', 'venta')
      .addSelect("COALESCE(s.invoice_number, '—')", 'factura')
      .addSelect(
        "NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')",
        'vendedor',
      )
      .addSelect(
        "NULLIF(TRIM(COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, '')), '')",
        'cliente',
      )
      .addSelect('w.name', 'bodega')
      .addSelect('si.product_name', 'producto')
      .addSelect('si.variant_sku', 'sku')
      .addSelect('si.variant_size', 'talla')
      .addSelect('si.variant_color', 'color')
      .addSelect('si.quantity', 'cantidad')
      .addSelect(refSql, 'referencia')
      .addSelect('si.unit_price', 'precioLista')
      .addSelect('si.discount_percent', 'descuento')
      .addSelect(NET_UNIT_SQL, 'precioCobrado')
      .addSelect('si.unit_cost', 'costoUnit')
      .addSelect('si.line_total', 'total')
      .addSelect('si.tax_amount', 'iva')
      .orderBy('s.created_at', 'DESC')
      .limit(MAX_ROWS + 1)
      .getRawMany<RawRow>();

    if (raw.length > MAX_ROWS) {
      warnings.push(
        `Se muestran las primeras ${MAX_ROWS.toLocaleString('es-CO')} líneas; los ` +
          `totales solo cubren esas.`,
      );
    }

    const rows = raw.slice(0, MAX_ROWS).map((r) => {
      const cantidad = int(r.cantidad);
      const referencia = money(r.referencia);
      const precioCobrado = money(r.precioCobrado);
      const costoUnit = money(r.costoUnit);
      const total = money(r.total);
      const neta = money(total - money(r.iva));
      const difUnit = money(precioCobrado - referencia);
      return {
        fecha: String(r.fecha ?? ''),
        venta: String(r.venta ?? ''),
        factura: String(r.factura ?? ''),
        vendedor: str(r.vendedor, '—'),
        cliente: str(r.cliente, 'Consumidor final'),
        bodega: String(r.bodega ?? ''),
        producto: String(r.producto ?? ''),
        sku: String(r.sku ?? ''),
        talla: String(r.talla ?? ''),
        color: String(r.color ?? ''),
        cantidad,
        referencia,
        precioLista: money(r.precioLista),
        descuento: money(r.descuento),
        precioCobrado,
        difUnit,
        difTotal: money(difUnit * cantidad),
        costoUnit,
        neta,
        utilidad: money(neta - costoUnit * cantidad),
      };
    });

    const columns: ReportColumn[] = [
      { key: 'fecha', label: 'Fecha', type: 'datetime' },
      { key: 'venta', label: 'Venta', type: 'text' },
      { key: 'factura', label: 'Factura', type: 'text' },
      { key: 'vendedor', label: 'Vendedor', type: 'text' },
      { key: 'cliente', label: 'Cliente', type: 'text' },
      { key: 'bodega', label: 'Bodega', type: 'text' },
      { key: 'producto', label: 'Producto', type: 'text' },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'talla', label: 'Talla', type: 'text' },
      { key: 'color', label: 'Color', type: 'text' },
      { key: 'cantidad', label: 'Cant.', type: 'number' },
      {
        key: 'referencia',
        label: reference === 'mayorista' ? 'Precio mayor' : 'Precio de lista',
        type: 'money',
        hint: 'Precio vigente hoy',
      },
      { key: 'descuento', label: 'Desc.', type: 'percent' },
      { key: 'precioCobrado', label: 'Precio cobrado', type: 'money' },
      {
        key: 'difUnit',
        label: 'Diferencia unit.',
        type: 'money',
        hint: 'Cobrado menos precio de referencia',
      },
      { key: 'difTotal', label: 'Diferencia total', type: 'money' },
      { key: 'costoUnit', label: 'Costo unit.', type: 'money' },
      { key: 'neta', label: 'Venta sin IVA', type: 'money' },
      { key: 'utilidad', label: 'Utilidad', type: 'money' },
    ];

    const difTotal = money(rows.reduce((s, r) => s + r.difTotal, 0));
    const titles: Record<(typeof MODES)[number], string> = {
      debajo: 'Vendidos por debajo del precio',
      encima: 'Vendidos por encima del precio',
      perdida: 'Vendidos por debajo del costo',
      descuentos: 'Ventas con descuento',
    };

    return {
      columns,
      rows,
      totals: [
        { key: 'lineas', label: 'Líneas', type: 'number', value: rows.length },
        {
          key: 'unidades',
          label: 'Unidades',
          type: 'number',
          value: rows.reduce((s, r) => s + r.cantidad, 0),
        },
        {
          key: 'difTotal',
          label: mode === 'encima' ? 'Cobrado de más' : 'Diferencia',
          type: 'money',
          value: difTotal,
        },
        {
          key: 'utilidad',
          label: 'Utilidad de estas líneas',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.utilidad, 0)),
        },
      ],
      title: `${titles[mode]} ${query.from} a ${query.to}`,
      warnings,
    };
  }
}
