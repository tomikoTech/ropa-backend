import ExcelJS from 'exceljs';
import type { CarteraCompleta } from './cartera-completa.js';

/**
 * La cartera completa en Excel: lo que Andrea armaba con una tabla dinámica.
 * Una hoja, un bloque por cliente con subtotal, gran total al final.
 */
export function libroDeCarteraCompleta(
  tienda: string,
  cartera: CarteraCompleta,
  generadoEl: string,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cartera');
  ws.columns = [
    { header: 'Cliente', key: 'cliente', width: 34 },
    { header: 'Teléfono', key: 'telefono', width: 14 },
    { header: 'Factura', key: 'numero', width: 16 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Vence', key: 'vence', width: 12 },
    { header: 'Días vencida', key: 'dias', width: 12 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Abonado', key: 'pagado', width: 14 },
    { header: 'Saldo', key: 'saldo', width: 14 },
  ];
  ws.insertRow(1, [
    `${tienda} · Cartera completa al ${generadoEl.slice(0, 10)}`,
  ]);
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.getRow(2).font = { bold: true };
  const plata = '#,##0';
  for (const c of cartera.clientes) {
    for (const f of c.facturas) {
      ws.addRow({
        cliente: c.cliente,
        telefono: c.telefono ?? '',
        numero: f.numero,
        fecha: f.fecha.slice(0, 10),
        vence: f.vence ?? '',
        dias: f.diasVencida || '',
        total: f.total,
        pagado: f.pagado,
        saldo: f.saldo,
      });
    }
    const sub = ws.addRow({
      cliente: `Subtotal ${c.cliente}`,
      total: c.facturado,
      pagado: c.pagado,
      saldo: c.saldo,
    });
    sub.font = { bold: true };
    ws.addRow({});
  }
  const tot = ws.addRow({
    cliente: 'TOTAL POR COBRAR',
    total: cartera.facturado,
    pagado: cartera.pagado,
    saldo: cartera.saldo,
  });
  tot.font = { bold: true, size: 12 };
  ['total', 'pagado', 'saldo'].forEach((k) => (ws.getColumn(k).numFmt = plata));
  return wb;
}
