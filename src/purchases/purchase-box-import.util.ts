import { BadRequestException } from '@nestjs/common';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

export interface PurchaseBoxImportRow {
  rowNumber: number;
  productCode: string;
  color: string;
  curve: string;
  boxes: number;
  unitsPerBox: number;
  unitCost: number;
  salePrice?: number;
  comment?: string;
}

const HEADER_ALIASES: Record<
  string,
  keyof Omit<PurchaseBoxImportRow, 'rowNumber'>
> = {
  producto_codigo: 'productCode',
  codigo_producto: 'productCode',
  product_code: 'productCode',
  color: 'color',
  curva: 'curve',
  curve: 'curve',
  cajas: 'boxes',
  boxes: 'boxes',
  unidades_por_caja: 'unitsPerBox',
  units_per_box: 'unitsPerBox',
  costo_unitario: 'unitCost',
  unit_cost: 'unitCost',
  precio_venta: 'salePrice',
  sale_price: 'salePrice',
  comentario: 'comment',
  comment: 'comment',
};

const scalarText = (value: unknown): string => {
  if (value == null) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) {
    return scalarText((value as { text: unknown }).text);
  }
  if (typeof value === 'object' && 'result' in value) {
    return scalarText((value as { result: unknown }).result);
  }
  if (typeof value === 'object' && 'richText' in value) {
    const richText = (value as { richText: unknown }).richText;
    if (Array.isArray(richText)) {
      return richText
        .map((part) =>
          part && typeof part === 'object' && 'text' in part
            ? scalarText((part as { text: unknown }).text)
            : '',
        )
        .join('');
    }
  }
  return '';
};

const normalize = (value: unknown): string =>
  scalarText(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const text = (value: unknown): string => {
  return scalarText(value).trim();
};

const numeric = (
  value: unknown,
  field: string,
  rowNumber: number,
  integer = false,
): number => {
  const raw =
    typeof value === 'number' ? value : Number(text(value).replace(',', '.'));
  if (!Number.isFinite(raw) || raw < 0 || (integer && !Number.isInteger(raw))) {
    throw new BadRequestException(
      `Fila ${rowNumber}: "${field}" debe ser un número ${integer ? 'entero ' : ''}mayor o igual a 0.`,
    );
  }
  return raw;
};

/** Lee XLSX o CSV usando exactamente el mismo contrato de columnas. */
export async function readPurchaseBoxImport(
  buffer: Buffer,
  filename: string,
): Promise<PurchaseBoxImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  if (filename.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from([buffer]));
  } else if (filename.toLowerCase().endsWith('.xlsx')) {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } else {
    throw new BadRequestException('El archivo debe ser .xlsx o .csv.');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    throw new BadRequestException(
      'El archivo no contiene renglones para importar.',
    );
  }

  const columns = new Map<
    number,
    keyof Omit<PurchaseBoxImportRow, 'rowNumber'>
  >();
  sheet.getRow(1).eachCell((cell, column) => {
    const key = HEADER_ALIASES[normalize(cell.value)];
    if (key) columns.set(column, key);
  });
  const required = ['productCode', 'boxes', 'unitsPerBox', 'unitCost'] as const;
  const missing = required.filter(
    (key) => ![...columns.values()].includes(key),
  );
  if (missing.length) {
    throw new BadRequestException(
      'Faltan columnas obligatorias. Descarga la plantilla actual y copia allí los datos.',
    );
  }

  const rows: PurchaseBoxImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const raw: Partial<
      Record<keyof Omit<PurchaseBoxImportRow, 'rowNumber'>, unknown>
    > = {};
    for (const [column, key] of columns) raw[key] = row.getCell(column).value;
    if (![...columns.keys()].some((column) => text(row.getCell(column).value)))
      continue;

    const productCode = text(raw.productCode);
    if (!productCode) {
      throw new BadRequestException(
        `Fila ${rowNumber}: falta "producto_codigo".`,
      );
    }
    const boxes = numeric(raw.boxes, 'cajas', rowNumber, true);
    const unitsPerBox = numeric(
      raw.unitsPerBox,
      'unidades_por_caja',
      rowNumber,
      true,
    );
    if (boxes < 1 || unitsPerBox < 1) {
      throw new BadRequestException(
        `Fila ${rowNumber}: cajas y unidades por caja deben ser mayores a 0.`,
      );
    }
    const salePriceText = text(raw.salePrice);
    rows.push({
      rowNumber,
      productCode,
      color: text(raw.color),
      curve: text(raw.curve),
      boxes,
      unitsPerBox,
      unitCost: numeric(raw.unitCost, 'costo_unitario', rowNumber),
      ...(salePriceText
        ? { salePrice: numeric(raw.salePrice, 'precio_venta', rowNumber) }
        : {}),
      ...(text(raw.comment) ? { comment: text(raw.comment) } : {}),
    });
  }
  if (!rows.length) {
    throw new BadRequestException(
      'El archivo no contiene renglones para importar.',
    );
  }
  if (rows.length > 2000) {
    throw new BadRequestException(
      'El archivo supera el máximo de 2.000 renglones.',
    );
  }
  return rows;
}

export async function buildPurchaseBoxTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cajas');
  sheet.columns = [
    { header: 'producto_codigo', key: 'productCode', width: 22 },
    { header: 'color', key: 'color', width: 18 },
    { header: 'curva', key: 'curve', width: 24 },
    { header: 'cajas', key: 'boxes', width: 12 },
    { header: 'unidades_por_caja', key: 'unitsPerBox', width: 22 },
    { header: 'costo_unitario', key: 'unitCost', width: 18 },
    { header: 'precio_venta', key: 'salePrice', width: 18 },
    { header: 'comentario', key: 'comment', width: 32 },
  ];
  sheet.addRow({
    productCode: 'REF-EJEMPLO',
    color: 'Negro',
    curve: 'Dama 36-39',
    boxes: 10,
    unitsPerBox: 24,
    unitCost: 12.5,
    salePrice: 120000,
    comment: 'Borra esta fila antes de importar',
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}
