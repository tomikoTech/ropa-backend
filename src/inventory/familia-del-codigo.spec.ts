import { armarFamilia } from './familia-del-codigo.js';

const producto = { id: 'p', name: 'Air Force 1', skuPrefix: 'AF1', brand: 'Nike', imageUrl: null };
const variantes = [
  { id: 'v41', sizeName: '41', colorName: 'Blanco', barcode: '7841', sku: 'AF1-41-BLA' },
  { id: 'v42', sizeName: '42', colorName: 'Blanco', barcode: '7842', sku: 'AF1-42-BLA' },
  { id: 'v43', sizeName: '43', colorName: 'Blanco', barcode: '7843', sku: 'AF1-43-BLA' },
  { id: 'vcaja', sizeName: 'Caja', colorName: 'Blanco', barcode: null, sku: 'AF1-CAJA' },
];
const bodegas = [
  { id: 'W1', name: 'AMAWAD' },
  { id: 'W2', name: 'LOCAL 214' },
];
const stocks = [
  { variantId: 'v41', warehouseId: 'W1', quantity: 2 },
  { variantId: 'v41', warehouseId: 'W2', quantity: 1 },
  { variantId: 'v42', warehouseId: 'W1', quantity: 1 },
  { variantId: 'vcaja', warehouseId: 'W2', quantity: 12 },
];
const unidades = [
  // La caja abierta de la que salieron los pares, y una caja cerrada en el otro local.
  { id: 'c1', barcode: 'CAJA1', kind: 'BOX' as const, status: 'SPLIT', variantId: 'vcaja', warehouseId: 'W1', quantity: 12, parentUnitId: null },
  { id: 'c2', barcode: 'CAJA2', kind: 'BOX' as const, status: 'IN_STOCK', variantId: 'vcaja', warehouseId: 'W2', quantity: 12, parentUnitId: null },
  { id: 'u41a', barcode: 'PAR41A', kind: 'UNIT' as const, status: 'IN_STOCK', variantId: 'v41', sizeName: '41', warehouseId: 'W1', quantity: 1, parentUnitId: 'c1' },
  { id: 'u41b', barcode: 'PAR41B', kind: 'UNIT' as const, status: 'IN_STOCK', variantId: 'v41', sizeName: '41', warehouseId: 'W2', quantity: 1, parentUnitId: 'c1' },
  { id: 'u41c', barcode: 'PAR41C', kind: 'UNIT' as const, status: 'IN_STOCK', variantId: 'v41', sizeName: '41', warehouseId: 'W1', quantity: 1, parentUnitId: 'c1' },
  { id: 'u42', barcode: 'PAR42', kind: 'UNIT' as const, status: 'IN_STOCK', variantId: 'v42', sizeName: '42', warehouseId: 'W1', quantity: 1, parentUnitId: 'c1' },
  { id: 'u43', barcode: 'PAR43', kind: 'UNIT' as const, status: 'SOLD', variantId: 'v43', sizeName: '43', warehouseId: 'W1', quantity: 1, parentUnitId: 'c1' },
];

describe('la familia de un código', () => {
  const familia = armarFamilia({ producto, variantes, stocks, bodegas, unidades, codigo: { unidadId: 'u41a' } });

  it('sabe de qué talla es el código y marca esa talla y ese par', () => {
    expect(familia.tallaDelCodigo).toBe('41');
    const t41 = familia.tallas.find((t) => t.talla === '41')!;
    expect(t41.esLaDelCodigo).toBe(true);
    expect(t41.pares.find((p) => p.codigo === 'PAR41A')?.esElCodigo).toBe(true);
    expect(familia.tallas.filter((t) => t.esLaDelCodigo)).toHaveLength(1);
  });

  it('las demás tallas con su existencia por bodega, en orden, incluida la que está en cero', () => {
    expect(familia.tallas.map((t) => [t.talla, t.total])).toEqual([
      ['41', 3],
      ['42', 1],
      ['43', 0],
      ['Caja', 12],
    ]);
    const t41 = familia.tallas.find((t) => t.talla === '41')!;
    expect(t41.porBodega).toEqual([
      { bodegaId: 'W1', bodega: 'AMAWAD', cantidad: 2 },
      { bodegaId: 'W2', bodega: 'LOCAL 214', cantidad: 1 },
    ]);
    expect(t41.pares.map((p) => `${p.codigo}@${p.bodega}`)).toEqual([
      'PAR41A@AMAWAD',
      'PAR41B@LOCAL 214',
      'PAR41C@AMAWAD',
    ]);
    expect(familia.tallas.find((t) => t.talla === '43')!.vendidos).toBe(1);
    // La caja cerrada cuenta en su talla: se dice cuántos están en caja.
    expect(familia.tallas.find((t) => t.talla === 'Caja')!.enCajas).toBe(12);
    expect(t41.enCajas).toBe(0);
  });

  it('la caja de la que salió, con sus hermanos y dónde está cada uno', () => {
    expect(familia.cajaDeOrigen?.codigo).toBe('CAJA1');
    expect(familia.cajaDeOrigen?.estado).toBe('SPLIT');
    expect(familia.cajaDeOrigen?.hermanos?.map((h) => `${h.talla} ${h.estado} ${h.bodega}`)).toEqual([
      '41 IN_STOCK AMAWAD',
      '41 IN_STOCK LOCAL 214',
      '41 IN_STOCK AMAWAD',
      '42 IN_STOCK AMAWAD',
      '43 SOLD AMAWAD',
    ]);
  });

  it('las cajas del modelo que siguen siendo cajas, y el total por bodega', () => {
    expect(familia.cajas.map((c) => `${c.codigo} ${c.estado} ${c.bodega}`)).toEqual(['CAJA2 IN_STOCK LOCAL 214']);
    expect(familia.totales).toEqual({
      pares: 16,
      porBodega: [
        { bodegaId: 'W2', bodega: 'LOCAL 214', cantidad: 13 },
        { bodegaId: 'W1', bodega: 'AMAWAD', cantidad: 3 },
      ],
    });
  });

  it('si el código es una caja cerrada, la caja de origen es ella misma', () => {
    const f = armarFamilia({ producto, variantes, stocks, bodegas, unidades, codigo: { unidadId: 'c2' } });
    expect(f.cajaDeOrigen?.codigo).toBe('CAJA2');
    expect(f.cajaDeOrigen?.esElCodigo).toBe(true);
    expect(f.cajas[0].esElCodigo).toBe(true);
    expect(f.tallaDelCodigo).toBe('Caja');
  });

  it('si el código es de una talla (sin bulto), se marca la talla y no hay caja de origen', () => {
    const f = armarFamilia({ producto, variantes, stocks, bodegas, unidades, codigo: { variantId: 'v42' } });
    expect(f.tallaDelCodigo).toBe('42');
    expect(f.cajaDeOrigen).toBeNull();
    expect(f.tallas.find((t) => t.talla === '42')?.esLaDelCodigo).toBe(true);
  });
});
