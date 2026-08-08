/**
 * Exportador único para todos los reportes.
 *
 * Como cada reporte devuelve sus columnas junto con sus filas, el Excel y el
 * CSV se construyen solos: no hay una función de exportación por reporte (que
 * es de donde salen los archivos que no coinciden con la pantalla).
 *
 * Los números van como **números**, no como texto con `$`: así se pueden sumar
 * y ordenar en Excel. El formato de moneda lo pone la celda.
 */

import ExcelJS from 'exceljs';
import type { Response } from 'express';
import type { ReportColumn, ReportResult } from './report-types.js';

export type ExportFormat = 'xlsx' | 'csv';

/** Formato de celda por tipo de columna. Pesos colombianos: sin decimales. */
function numberFormat(type: ReportColumn['type']): string | undefined {
  switch (type) {
    case 'money':
      return '"$"#,##0';
    case 'number':
      return '#,##0';
    case 'percent':
      return '0.00"%"';
    default:
      return undefined;
  }
}

function columnWidth(col: ReportColumn): number {
  switch (col.type) {
    case 'money':
      return 16;
    case 'number':
    case 'percent':
      return 12;
    case 'date':
      return 12;
    case 'datetime':
      return 18;
    default:
      return Math.min(40, Math.max(14, col.label.length + 4));
  }
}

/** Nombre de archivo sin caracteres que molesten a Windows ni al header HTTP. */
export function safeFilename(base: string): string {
  return (
    base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'reporte'
  );
}

function fillSheet(sheet: ExcelJS.Worksheet, result: ReportResult): void {
  sheet.columns = result.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: columnWidth(c),
  }));

  for (const row of result.rows) sheet.addRow(row);

  sheet.getRow(1).font = { bold: true };
  result.columns.forEach((col, i) => {
    const fmt = numberFormat(col.type);
    if (fmt) sheet.getColumn(i + 1).numFmt = fmt;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Hoja con lo que se pidió y lo que hay que tener en cuenta al leer el
 * archivo. Un reporte impreso sin sus filtros no se puede auditar.
 */
function fillContextSheet(
  sheet: ExcelJS.Worksheet,
  result: ReportResult,
  filters: Record<string, string>,
): void {
  sheet.columns = [
    { header: 'Concepto', key: 'k', width: 34 },
    { header: 'Valor', key: 'v', width: 46 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({ k: 'Reporte', v: result.title });
  sheet.addRow({ k: 'Filas', v: result.rows.length });

  if (result.totals.length) {
    sheet.addRow({});
    sheet.addRow({ k: 'TOTALES', v: '' }).font = { bold: true };
    for (const t of result.totals) {
      sheet.addRow({ k: t.label, v: t.value });
    }
  }

  const applied = Object.entries(filters).filter(([k]) => k !== 'token');
  if (applied.length) {
    sheet.addRow({});
    sheet.addRow({ k: 'FILTROS APLICADOS', v: '' }).font = { bold: true };
    for (const [k, v] of applied) sheet.addRow({ k, v });
  }

  if (result.warnings?.length) {
    sheet.addRow({});
    sheet.addRow({ k: 'AVISOS', v: '' }).font = { bold: true };
    for (const w of result.warnings) sheet.addRow({ k: '', v: w });
  }
}

/**
 * Escribe el reporte en la respuesta HTTP.
 *
 * El CSV sale de una hoja sola (datos + bloque de totales al final), porque un
 * CSV no tiene hojas y perder los totales al exportar es justo lo que hace que
 * alguien los vuelva a sumar a mano.
 */
export async function writeReportFile(
  res: Response,
  result: ReportResult,
  format: ExportFormat,
  filters: Record<string, string> = {},
): Promise<void> {
  const filename = safeFilename(result.title);
  const workbook = new ExcelJS.Workbook();

  if (format === 'csv') {
    const sheet = workbook.addWorksheet('Reporte');
    fillSheet(sheet, result);
    if (result.totals.length) {
      sheet.addRow({});
      const label = result.columns[0]?.key ?? 'total';
      for (const t of result.totals) {
        sheet.addRow({ [label]: `${t.label}: ${t.value}` });
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${filename}.csv`,
    );
    // BOM: sin esto Excel en Windows abre los acentos como basura.
    res.write('\uFEFF');
    await workbook.csv.write(res);
    res.end();
    return;
  }

  fillSheet(workbook.addWorksheet('Datos'), result);
  fillContextSheet(workbook.addWorksheet('Resumen'), result, filters);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}
