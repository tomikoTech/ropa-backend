/**
 * Catálogo de reportes (F9).
 *
 * El sistema anterior tiene **35 páginas de reportes casi iguales**: cada una
 * con su formulario, sus filtros y su tabla. Aquí hay **seis reportes
 * parametrizables** que cubren esos mismos números, y una sola pantalla que
 * los pinta todos.
 *
 * Cada definición dice qué absorbe (`absorbs`) para poder verificar la paridad
 * uno por uno, y qué NO incluye el número (`notes`): un total sin su letra
 * chica se malinterpreta y después nadie confía en el reporte.
 */

import type { ReportDefinition, ReportFilterDef } from './report-types.js';

/** Reportes del sistema anterior que hoy no se pueden replicar, y por qué. */
export const UNCOVERED_LEGACY_REPORTS: { name: string; reason: string }[] = [
  {
    name: 'Despacho por impulsador',
    reason:
      'No existe la figura de impulsador ni la atribución de venta por línea ' +
      '(Fase 5, pendiente).',
  },
  {
    name: 'Devoluciones en compra',
    reason:
      'MiPinta registra devoluciones de venta, no de compra al proveedor. ' +
      'Hace falta el flujo antes que el reporte.',
  },
  {
    name: 'Excluidos',
    reason:
      'No existe el concepto de excluir un producto de la venta con fecha de ' +
      'exclusión.',
  },
  {
    name: 'Productos sin Muestra',
    reason:
      'Depende de "muestra por local", que MiPinta no modela. La pregunta ' +
      '"qué puedo enviar desde dónde" se responde con Inventario agrupado ' +
      'por bodega.',
  },
];

// ── Filtros reutilizables ───────────────────────────────────────────────────

const fPeriodo: ReportFilterDef = {
  kind: 'dateRange',
  key: 'from',
  label: 'Período',
};
const fBodega: ReportFilterDef = {
  kind: 'lookup',
  key: 'warehouseId',
  label: 'Bodega',
  source: 'warehouses',
  placeholder: 'Todas',
};
const fCategoria: ReportFilterDef = {
  kind: 'lookup',
  key: 'categoryId',
  label: 'Categoría',
  source: 'categories',
  placeholder: 'Todas',
};
const fMarca: ReportFilterDef = {
  kind: 'lookup',
  key: 'brand',
  label: 'Marca',
  source: 'brands',
  placeholder: 'Todas',
};
const fVendedor: ReportFilterDef = {
  kind: 'lookup',
  key: 'userId',
  label: 'Vendedor',
  source: 'users',
  placeholder: 'Todos',
};

function search(placeholder: string): ReportFilterDef {
  return { kind: 'text', key: 'search', label: 'Buscar', placeholder };
}

// ── Los seis reportes ───────────────────────────────────────────────────────

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    key: 'inventario',
    label: 'Inventario',
    group: 'Inventario',
    description:
      'Qué hay, dónde está y cuánto vale. Se agrupa como haga falta: por ' +
      'referencia, por producto, por bodega, por categoría, por marca o por ' +
      'la ubicación física del bulto.',
    absorbs: [
      'Inventario General',
      'Inventario por bodega',
      'Inventario por producto',
      'Inventario por tipo',
      'Productos en Stands',
    ],
    notes: [
      'El valor de venta usa el precio de hoy, no el de cuando entró la mercancía.',
      'Agrupado por ubicación solo aparece lo que tiene código de barras propio ' +
        '(bultos etiquetados); el inventario suelto no tiene stand.',
    ],
    filters: [
      search('Producto, SKU o código de barras'),
      {
        kind: 'select',
        key: 'groupBy',
        label: 'Agrupar por',
        fixed: true,
        options: [
          { value: 'variante', label: 'Referencia (talla y color)' },
          { value: 'producto', label: 'Producto' },
          { value: 'bodega', label: 'Bodega' },
          { value: 'categoria', label: 'Categoría' },
          { value: 'marca', label: 'Marca' },
          { value: 'ubicacion', label: 'Ubicación física (bultos)' },
        ],
      },
      fBodega,
      fCategoria,
      fMarca,
      {
        kind: 'lookup',
        key: 'sizeId',
        label: 'Talla',
        source: 'sizes',
        placeholder: 'Todas',
      },
      {
        kind: 'lookup',
        key: 'colorId',
        label: 'Color',
        source: 'colors',
        placeholder: 'Todos',
      },
      {
        kind: 'toggle',
        key: 'includeZero',
        label: 'Incluir existencias en cero',
      },
      {
        kind: 'toggle',
        key: 'onlyLowStock',
        label: 'Solo por debajo del mínimo',
      },
    ],
    defaults: { groupBy: 'variante' },
  },

  {
    key: 'valorizacion',
    label: 'Valorización',
    group: 'Inventario',
    description:
      'Cuánto costó contra cuánto se va a vender, con la diferencia y el ' +
      'margen por referencia. En modo Ingresos muestra lo que entró a ' +
      'inventario en el período, con su costo.',
    absorbs: ['Costo de Inventario', 'Ingreso a inventario', 'Existencias'],
    notes: [
      'El costo es el costo ACTUAL del producto, también en Ingresos: el ' +
        'movimiento de inventario no guarda con qué costo entró la mercancía. ' +
        'El costo puesto en bodega exacto sí queda en las compras por caja.',
      'Margen sobre el precio de venta (no sobre el costo).',
    ],
    filters: [
      {
        kind: 'select',
        key: 'mode',
        label: 'Ver',
        fixed: true,
        options: [
          { value: 'existencias', label: 'Costo de lo que hay hoy' },
          { value: 'ingresos', label: 'Ingresos a inventario del período' },
        ],
      },
      { ...fPeriodo, appliesTo: { key: 'mode', values: ['ingresos'] } },
      search('Producto o SKU'),
      fBodega,
      fCategoria,
      fMarca,
    ],
    defaults: { mode: 'existencias' },
  },

  {
    key: 'utilidad',
    label: 'Ventas y utilidad',
    group: 'Ventas',
    description:
      'Lo vendido contra lo que costó, con la utilidad y el margen. Se agrupa ' +
      'por línea, venta, día, vendedor, producto, categoría, marca o bodega — ' +
      'de ahí salen tanto el cierre diario como el desempeño por vendedor.',
    absorbs: [
      'Utilidad',
      'Despachos (cierre de venta)',
      'Cierre por instancia',
      'Despacho por bodega',
      'Despacho por usuario',
      'Despacho por producto',
    ],
    notes: [
      'Solo ventas completadas. Las devoluciones NO se restan: están en ' +
        'Movimientos → Devoluciones.',
      'El costo es el que tenía la línea al venderse. Las líneas sin costo ' +
        'registrado se cuentan aparte para no inflar la utilidad.',
    ],
    filters: [
      fPeriodo,
      search('Producto, SKU, factura o cliente'),
      {
        kind: 'select',
        key: 'groupBy',
        label: 'Agrupar por',
        fixed: true,
        options: [
          { value: 'linea', label: 'Línea de venta (detalle)' },
          { value: 'venta', label: 'Venta / factura' },
          { value: 'dia', label: 'Día' },
          { value: 'vendedor', label: 'Vendedor' },
          { value: 'producto', label: 'Producto' },
          { value: 'categoria', label: 'Categoría' },
          { value: 'marca', label: 'Marca' },
          { value: 'bodega', label: 'Bodega' },
        ],
      },
      fBodega,
      fVendedor,
      fCategoria,
      fMarca,
      {
        kind: 'lookup',
        key: 'channel',
        label: 'Canal',
        source: 'saleChannels',
        placeholder: 'Todos',
      },
    ],
    defaults: { groupBy: 'linea' },
  },

  {
    key: 'control-precios',
    label: 'Control de precios',
    group: 'Ventas',
    description:
      'Qué se vendió por debajo o por encima del precio, qué se vendió por ' +
      'debajo del costo y dónde se aplicaron descuentos.',
    absorbs: [
      'Vendidos por debajo del precio',
      'Vendidos por encima del precio',
      'Productos con pérdida',
      'Descuentos',
    ],
    notes: [
      'El precio de referencia es el de HOY (base o mayorista): si el precio ' +
        'cambió después de la venta, la diferencia lo refleja.',
      'La pérdida compara el precio neto de descuento contra el costo de la línea.',
    ],
    filters: [
      {
        kind: 'select',
        key: 'mode',
        label: 'Ver',
        fixed: true,
        options: [
          { value: 'debajo', label: 'Vendido por debajo del precio' },
          { value: 'encima', label: 'Vendido por encima del precio' },
          { value: 'perdida', label: 'Vendido por debajo del costo' },
          { value: 'descuentos', label: 'Con descuento aplicado' },
        ],
      },
      fPeriodo,
      {
        kind: 'select',
        key: 'reference',
        label: 'Comparar contra',
        fixed: true,
        appliesTo: { key: 'mode', values: ['debajo', 'encima'] },
        options: [
          { value: 'base', label: 'Precio de venta' },
          { value: 'mayorista', label: 'Precio por mayor' },
        ],
      },
      search('Producto, SKU, factura o cliente'),
      fBodega,
      fVendedor,
    ],
    defaults: { mode: 'debajo', reference: 'base' },
  },

  {
    key: 'cartera',
    label: 'Cartera y bancos',
    group: 'Finanzas',
    description:
      'Lo que deben los clientes, lo que se les debe a los proveedores y el ' +
      'movimiento de plata por método de pago y banco.',
    absorbs: ['Saldos', 'Saldos Pedido', 'Bancos'],
    notes: [
      'El saldo se calcula (total menos abonos), no se guarda: no puede quedar ' +
        'desincronizado.',
      'En Bancos, las entradas son pagos de venta y abonos de clientes; las ' +
        'salidas, egresos y abonos a proveedores.',
    ],
    filters: [
      {
        kind: 'select',
        key: 'mode',
        label: 'Ver',
        fixed: true,
        options: [
          { value: 'cobrar', label: 'Cuentas por cobrar (clientes)' },
          { value: 'pagar', label: 'Cuentas por pagar (proveedores)' },
          { value: 'bancos', label: 'Movimiento por banco y método' },
        ],
      },
      fPeriodo,
      search('Cliente, proveedor o número'),
      {
        kind: 'toggle',
        key: 'onlyOpen',
        label: 'Solo con saldo pendiente',
        appliesTo: { key: 'mode', values: ['cobrar', 'pagar'] },
      },
      {
        kind: 'lookup',
        key: 'bankId',
        label: 'Banco',
        source: 'banks',
        placeholder: 'Todos',
        appliesTo: { key: 'mode', values: ['bancos'] },
      },
      {
        kind: 'lookup',
        key: 'method',
        label: 'Forma de pago',
        source: 'paymentMethods',
        placeholder: 'Todas',
        appliesTo: { key: 'mode', values: ['bancos'] },
      },
      {
        kind: 'lookup',
        key: 'supplierId',
        label: 'Proveedor',
        source: 'suppliers',
        placeholder: 'Todos',
        appliesTo: { key: 'mode', values: ['pagar'] },
      },
    ],
    defaults: { mode: 'cobrar', onlyOpen: 'true' },
  },

  {
    key: 'movimientos',
    label: 'Movimientos y novedades',
    group: 'Inventario',
    description:
      'Todo lo que movió inventario sin ser una venta: ajustes y bajas con su ' +
      'motivo, traslados entre bodegas, devoluciones, conteos físicos, ventas ' +
      'de terceros y bonos.',
    absorbs: [
      'Dados de baja',
      'Remisiones sin recibir',
      'Ventas internas',
      'Verificación de inventario',
      'Despacho por patinador',
      'Facturas externos app',
      'Descuentos (bonos)',
    ],
    notes: [
      'Un ajuste negativo es una baja o una merma; el motivo es lo que se ' +
        'escribió al hacerlo.',
      'En Despachos a patinadores, el "faltante" es lo que no volvió ni como ' +
        'plata ni como mercancía: está valorado al precio de calle.',
    ],
    filters: [
      {
        kind: 'select',
        key: 'mode',
        label: 'Ver',
        fixed: true,
        options: [
          { value: 'ajustes', label: 'Ajustes y bajas' },
          { value: 'traslados', label: 'Traslados entre bodegas' },
          { value: 'devoluciones', label: 'Devoluciones de venta' },
          { value: 'conteos', label: 'Conteos físicos' },
          { value: 'consignaciones', label: 'Ventas de terceros' },
          { value: 'patinadores', label: 'Despachos a patinadores' },
          { value: 'bonos', label: 'Bonos y cupones' },
        ],
      },
      fPeriodo,
      search('Producto, SKU, motivo o número'),
      fBodega,
      {
        ...fVendedor,
        label: 'Usuario',
        appliesTo: { key: 'mode', values: ['ajustes', 'devoluciones'] },
      },
      {
        kind: 'select',
        key: 'status',
        label: 'Estado',
        appliesTo: { key: 'mode', values: ['traslados'] },
        options: [
          { value: 'PENDING', label: 'Sin recibir' },
          { value: 'RECEIVED', label: 'Recibido' },
          { value: 'RETURNED', label: 'Devuelto' },
          { value: 'CANCELLED', label: 'Anulado' },
        ],
        placeholder: 'Todos',
      },
    ],
    defaults: { mode: 'ajustes' },
  },
];

export function findReportDefinition(
  key: string,
): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((d) => d.key === key);
}
