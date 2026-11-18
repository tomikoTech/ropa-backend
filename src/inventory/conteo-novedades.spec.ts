import { clasificarConteo, diferenciaDeUnidades } from './conteo-novedades';

const BODEGA = 'bodega-amawad';
let reloj = 0;
const lectura = (
  barcode: string,
  result: string,
  stockUnitId: string | null = barcode,
) => ({
  barcode,
  result,
  stockUnitId,
  createdAt: new Date(1_700_000_000_000 + reloj++ * 1000),
});
const esperado = (
  id: string,
  status = 'IN_STOCK',
  warehouseId = BODEGA,
  quantity = 1,
) => ({
  stockUnitId: id,
  barcode: id,
  quantity,
  stockUnit: { status, warehouseId },
});

describe('clasificarConteo', () => {
  it('el caso de AMAWAD: 42 lecturas raras son 11 códigos con novedad, y las repetidas van aparte', () => {
    const fotos = Array.from({ length: 20 }, (_, i) => esperado(`P${i}`));
    const lecturas = [
      // 18 contados; P18 y P19 no aparecen.
      ...fotos.slice(0, 18).map((f) => lectura(f.barcode, 'COUNTED')),
      // 23 códigos repetidos en 29 lecturas.
      ...Array.from({ length: 23 }, (_, i) =>
        lectura(`P${i % 18}`, 'DUPLICATE'),
      ),
      ...Array.from({ length: 6 }, (_, i) => lectura(`P${i}`, 'DUPLICATE')),
      // 2 no disponibles, 4 desconocidos en 5 lecturas, 5 de otra bodega en 6.
      lectura('VENDIDO', 'NOT_AVAILABLE'),
      lectura('PRESTADO', 'NOT_AVAILABLE'),
      lectura('191846156256', 'UNKNOWN', null),
      lectura('191846156256', 'UNKNOWN', null),
      lectura('X1', 'UNKNOWN', null),
      lectura('X2', 'UNKNOWN', null),
      lectura('X3', 'UNKNOWN', null),
      ...['L1', 'L2', 'L3', 'L4', 'L5'].map((c) =>
        lectura(c, 'WRONG_WAREHOUSE'),
      ),
      lectura('L5', 'WRONG_WAREHOUSE'),
    ];

    const r = clasificarConteo(fotos, lecturas, {
      bodegaId: BODEGA,
      enVivo: true,
    });

    expect(r.contados).toHaveLength(18);
    expect(r.faltantes.map((f) => f.barcode)).toEqual(['P18', 'P19']);
    expect(r.novedades).toHaveLength(11);
    const porTipo = (t: string) =>
      r.novedades.filter((n) => n.tipo === t).length;
    expect([
      porTipo('NOT_AVAILABLE'),
      porTipo('UNKNOWN'),
      porTipo('WRONG_WAREHOUSE'),
    ]).toEqual([2, 4, 5]);
    expect(
      r.novedades.find((n) => n.barcode === '191846156256')?.lecturas,
    ).toBe(2);
    expect(r.repetidos).toHaveLength(18);
    expect(r.repetidos.reduce((s, g) => s + g.lecturas, 0)).toBe(29);
  });

  it('esperados = contados + faltantes + salieron, siempre', () => {
    const fotos = [
      esperado('A'),
      esperado('B'),
      esperado('C', 'SOLD'),
      esperado('D', 'IN_STOCK', 'otra-bodega'),
      esperado('E'),
    ];
    const r = clasificarConteo(
      fotos,
      [lectura('A', 'COUNTED'), lectura('B', 'COUNTED')],
      { bodegaId: BODEGA, enVivo: true },
    );
    expect(r.contados.length + r.faltantes.length + r.salieron.length).toBe(
      fotos.length,
    );
    expect(r.faltantes.map((f) => f.barcode)).toEqual(['E']);
    expect(r.salieron.map((f) => f.barcode)).toEqual(['C', 'D']);
  });

  it('en un conteo cerrado, lo que pasó después no cambia lo que faltó', () => {
    // Cerrado con ajuste: el faltante quedó dado de baja; sigue siendo faltante.
    const r = clasificarConteo(
      [esperado('A'), esperado('B', 'WRITTEN_OFF')],
      [lectura('A', 'COUNTED')],
      { bodegaId: BODEGA, enVivo: false },
    );
    expect(r.faltantes.map((f) => f.barcode)).toEqual(['B']);
    expect(r.salieron).toEqual([]);
  });

  it('el sobrante es lo que se encontró sin estar en la foto', () => {
    const r = clasificarConteo(
      [esperado('A')],
      [lectura('A', 'COUNTED'), lectura('NUEVO', 'SURPLUS')],
      { bodegaId: BODEGA, enVivo: true },
    );
    expect(r.sobrantes.map((s) => s.barcode)).toEqual(['NUEVO']);
    expect(r.contados.map((s) => s.barcode)).toEqual(['A']);
  });

  it('una novedad que después se contó deja de ser novedad', () => {
    const r = clasificarConteo(
      [esperado('A')],
      [lectura('A', 'NOT_AVAILABLE'), lectura('A', 'COUNTED')],
      { bodegaId: BODEGA, enVivo: true },
    );
    expect(r.novedades).toEqual([]);
    expect(r.faltantes).toEqual([]);
  });

  it('el mismo desconocido con espacios o minúsculas es un solo código', () => {
    const r = clasificarConteo(
      [],
      [lectura('abc-1', 'UNKNOWN', null), lectura(' ABC-1 ', 'UNKNOWN', null)],
      { bodegaId: BODEGA, enVivo: true },
    );
    expect(r.novedades).toHaveLength(1);
    expect(r.novedades[0].lecturas).toBe(2);
  });

  it('la novedad muestra la lectura más reciente, y las más nuevas van primero', () => {
    const r = clasificarConteo(
      [],
      [
        lectura('L1', 'WRONG_WAREHOUSE'),
        lectura('X', 'UNKNOWN', null),
        lectura('L1', 'WRONG_WAREHOUSE'),
      ],
      { bodegaId: BODEGA, enVivo: true },
    );
    expect(r.novedades.map((n) => n.barcode)).toEqual(['L1', 'X']);
    expect(r.novedades[0].ultima.createdAt.getTime()).toBeGreaterThan(
      r.novedades[1].ultima.createdAt.getTime(),
    );
  });
});

describe('diferenciaDeUnidades', () => {
  it('suma faltantes y sobrantes por referencia sin que se cancelen', () => {
    expect(
      diferenciaDeUnidades([
        { expectedQuantity: 10, countedQuantity: 7 },
        { expectedQuantity: 2, countedQuantity: 4 },
        { expectedQuantity: 5, countedQuantity: 5 },
      ]),
    ).toEqual({
      esperadas: 17,
      contadas: 16,
      faltan: 3,
      sobran: 2,
      referencias: 2,
    });
  });
});
