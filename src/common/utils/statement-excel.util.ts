import { diaDeCalendario } from './dia-de-calendario.util.js';
import ExcelJS from 'exceljs';

export interface StatementItem {
  name: string;
  size?: string;
  color?: string;
  quantity: number;
  unit: number;
  lineTotal: number;
}

export interface StatementInvoice {
  number: string | null;
  date: Date | string | null;
  dueDate: Date | string | null;
  status: string;
  total: number;
  paid: number;
  balance: number;
  items: StatementItem[];
}

export interface StatementData {
  kind: 'client' | 'supplier';
  header: {
    name: string;
    doc?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  invoices: StatementInvoice[];
  totals: { totalBase: number; totalPaid: number; totalDebt: number };
  baseLabel: string;
}

const STATUS_ES: Record<string, string> = {
  PAID: 'Pagada',
  PARTIAL: 'Parcial',
  PENDING: 'Pendiente',
};

/**
 * El día que va a la celda, en la zona de la tienda.
 *
 * Antes era `toISOString().slice(0, 10)`, que es el día en **UTC**: una venta
 * hecha a las ocho de la noche en Colombia salía en el estado de cuenta con la
 * fecha del día siguiente, y el cliente que lo revisaba no encontraba su
 * factura donde debía estar.
 */
export function fmtDate(d: Date | string | null): string {
  if (!d) return '';
  try {
    return diaDeCalendario(d);
  } catch {
    // Una fila vieja ilegible deja la celda en blanco; reventar dejaría al
    // cliente sin el archivo entero.
    return '';
  }
}

/**
 * Construye el libro de Excel de un estado de cuenta (cliente o proveedor).
 * Tres hojas: Resumen, Facturas y Detalle. Genérico y reutilizable.
 */
export function buildStatementWorkbook(data: StatementData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const who = data.kind === 'client' ? 'Cliente' : 'Proveedor';

  // Resumen
  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Campo', key: 'k', width: 26 },
    { header: 'Valor', key: 'v', width: 40 },
  ];
  resumen.addRows([
    { k: who, v: data.header.name },
    { k: 'Documento / NIT', v: data.header.doc ?? '' },
    { k: 'Teléfono', v: data.header.phone ?? '' },
    { k: 'Correo', v: data.header.email ?? '' },
    { k: 'Dirección', v: data.header.address ?? '' },
    { k: '', v: '' },
    { k: data.baseLabel, v: data.totals.totalBase },
    { k: 'Total pagado', v: data.totals.totalPaid },
    { k: 'Saldo pendiente', v: data.totals.totalDebt },
  ]);
  resumen.getColumn('v').numFmt = '#,##0';
  resumen.getRow(1).font = { bold: true };

  // Facturas
  const facturas = wb.addWorksheet('Facturas');
  facturas.columns = [
    { header: 'Factura', key: 'number', width: 20 },
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Vence', key: 'due', width: 14 },
    { header: 'Estado', key: 'status', width: 12 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Pagado', key: 'paid', width: 16 },
    { header: 'Saldo', key: 'balance', width: 16 },
  ];
  for (const inv of data.invoices) {
    facturas.addRow({
      number: inv.number ?? '',
      date: fmtDate(inv.date),
      due: fmtDate(inv.dueDate),
      status: STATUS_ES[inv.status] ?? inv.status,
      total: inv.total,
      paid: inv.paid,
      balance: inv.balance,
    });
  }
  ['total', 'paid', 'balance'].forEach((c) => {
    facturas.getColumn(c).numFmt = '#,##0';
  });
  facturas.getRow(1).font = { bold: true };

  // Detalle (ítems por factura)
  const detalle = wb.addWorksheet('Detalle');
  detalle.columns = [
    { header: 'Factura', key: 'number', width: 20 },
    { header: 'Producto', key: 'name', width: 30 },
    { header: 'Talla', key: 'size', width: 10 },
    { header: 'Color', key: 'color', width: 12 },
    { header: 'Cantidad', key: 'qty', width: 12 },
    { header: 'Precio unit.', key: 'unit', width: 16 },
    { header: 'Total', key: 'line', width: 16 },
  ];
  for (const inv of data.invoices) {
    for (const it of inv.items) {
      detalle.addRow({
        number: inv.number ?? '',
        name: it.name,
        size: it.size ?? '',
        color: it.color ?? '',
        qty: it.quantity,
        unit: it.unit,
        line: it.lineTotal,
      });
    }
  }
  ['unit', 'line'].forEach((c) => {
    detalle.getColumn(c).numFmt = '#,##0';
  });
  detalle.getRow(1).font = { bold: true };

  return wb;
}
