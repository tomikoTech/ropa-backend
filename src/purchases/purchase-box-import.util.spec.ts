import ExcelJS from 'exceljs';
import {
  buildPurchaseBoxTemplate,
  readPurchaseBoxImport,
} from './purchase-box-import.util.js';

describe('importación de cajas por archivo', () => {
  it('lee la plantilla XLSX con tipos numéricos', async () => {
    const file = await buildPurchaseBoxTemplate();
    const rows = await readPurchaseBoxImport(file, 'cajas.xlsx');
    expect(rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        productCode: 'REF-EJEMPLO',
        color: 'Negro',
        curve: 'Dama 36-39',
        boxes: 10,
        unitsPerBox: 24,
        unitCost: 12.5,
        salePrice: 120000,
      }),
    ]);
  });

  it('acepta CSV y omite filas vacías', async () => {
    const csv = Buffer.from(
      'producto_codigo,color,curva,cajas,unidades_por_caja,costo_unitario,precio_venta,comentario\n' +
        'SKU-1,Negro,,2,6,3.25,,Primera\n' +
        ',,,,,,,\n',
    );
    await expect(readPurchaseBoxImport(csv, 'cajas.csv')).resolves.toEqual([
      expect.objectContaining({
        productCode: 'SKU-1',
        boxes: 2,
        unitsPerBox: 6,
        unitCost: 3.25,
      }),
    ]);
  });

  it('rechaza una fila inválida indicando su número', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cajas');
    sheet.addRow([
      'producto_codigo',
      'cajas',
      'unidades_por_caja',
      'costo_unitario',
    ]);
    sheet.addRow(['SKU-1', 0, 24, 10]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(readPurchaseBoxImport(file, 'cajas.xlsx')).rejects.toThrow(
      'Fila 2: cajas y unidades por caja deben ser mayores a 0',
    );
  });
});
