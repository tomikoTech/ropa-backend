import { paresVigentesDeLaVenta } from './pares-vigentes.js';

/**
 * Qué pares sigue teniendo una factura después de editarla.
 *
 * El detalle de la venta leía **todos** los movimientos de tipo `SALE` de esa
 * factura y tomaba los primeros. Editar una venta deja tres movimientos: la
 * salida original, la devolución de la edición y la salida nueva. Así que el
 * detalle mostraba el par que se había **devuelto**.
 *
 * Con los códigos impresos en la caja eso es grave: el cliente vuelve con un
 * par, se edita la factura, y la factura sigue diciendo que se llevó el otro.
 *
 * La cuenta es por signo, no por tipo de movimiento: lo que salió suma, lo que
 * volvió resta. Así también funciona para una anulación parcial o para
 * cualquier motivo que aparezca después.
 */

const mov = (quantity: number, ...unitBarcodes: string[]) => ({
  quantity,
  unitBarcodes,
});

describe('paresVigentesDeLaVenta', () => {
  it('una venta sin editar deja los que salieron', () => {
    expect(paresVigentesDeLaVenta([mov(-2, 'AAA', 'BBB')])).toEqual([
      'AAA',
      'BBB',
    ]);
  });

  it('lo que la edición devolvió deja de contar', () => {
    // El caso real, tal cual queda en la base: salida de dos, devolución de
    // los dos, salida nueva de uno.
    expect(
      paresVigentesDeLaVenta([
        mov(-2, 'AAA', 'BBB'),
        mov(2, 'AAA', 'BBB'),
        mov(-1, 'BBB'),
      ]),
    ).toEqual(['BBB']);
  });

  it('el orden es el de la salida que sigue vigente', () => {
    expect(
      paresVigentesDeLaVenta([
        mov(-2, 'AAA', 'BBB'),
        mov(2, 'AAA', 'BBB'),
        mov(-2, 'CCC', 'AAA'),
      ]),
    ).toEqual(['CCC', 'AAA']);
  });

  it('devolver un par de dos deja el otro', () => {
    expect(
      paresVigentesDeLaVenta([mov(-2, 'AAA', 'BBB'), mov(1, 'AAA')]),
    ).toEqual(['BBB']);
  });

  it('una anulación completa no deja ninguno', () => {
    expect(
      paresVigentesDeLaVenta([mov(-2, 'AAA', 'BBB'), mov(2, 'AAA', 'BBB')]),
    ).toEqual([]);
  });

  it('un movimiento sin códigos no estorba', () => {
    // Existencia que iba por delante de las etiquetas: el movimiento existe y
    // no trae códigos.
    expect(
      paresVigentesDeLaVenta([mov(-2, 'AAA'), { quantity: -1, unitBarcodes: [] }]),
    ).toEqual(['AAA']);
  });

  it('un movimiento con los códigos en nulo tampoco', () => {
    // La columna `unit_barcodes` es nullable y la base devuelve `null`, no un
    // arreglo vacío. Es el caso real, y el que revienta si no se contempla.
    expect(
      paresVigentesDeLaVenta([
        { quantity: -2, unitBarcodes: null },
        mov(-1, 'AAA'),
        { quantity: 1, unitBarcodes: null },
      ]),
    ).toEqual(['AAA']);
  });

  it('devolver algo que nunca salió no rompe la cuenta', () => {
    // Dato viejo o inconsistente: se ignora en vez de dejar la lista en
    // negativo.
    expect(paresVigentesDeLaVenta([mov(-1, 'AAA'), mov(1, 'ZZZ')])).toEqual([
      'AAA',
    ]);
  });

  it('sin movimientos, ninguno', () => {
    expect(paresVigentesDeLaVenta([])).toEqual([]);
  });
});

/**
 * El caso que dejó una factura imposible de editar.
 *
 * Una tarde de ediciones sobre la misma venta dejó el historial desparejo: el
 * código …0014 salió **tres** veces y volvió **dos**. La lista de vigentes lo
 * devolvía repetido, el reparto se lo entregaba a dos renglones distintos, y
 * al guardar el servidor se negaba —«esta factura repite un bulto»— sin que
 * nadie pudiera ver por qué. Desde el mostrador: la factura no se deja tocar.
 */
describe('un bulto no puede quedar dos veces en la misma factura', () => {
  it('con más salidas que devoluciones, el código sale una sola vez', () => {
    const vigentes = paresVigentesDeLaVenta([
      { quantity: -24, unitBarcodes: ['26090800010090014'] },
      { quantity: -24, unitBarcodes: ['26090800010090014'] },
      { quantity: -24, unitBarcodes: ['26090800010090014'] },
      { quantity: 24, unitBarcodes: ['26090800010090014'] },
    ]);
    expect(vigentes).toEqual(['26090800010090014']);
  });

  it('dos cajas distintas siguen siendo dos', () => {
    const vigentes = paresVigentesDeLaVenta([
      { quantity: -24, unitBarcodes: ['A'] },
      { quantity: -24, unitBarcodes: ['B'] },
    ]);
    expect(vigentes).toEqual(['A', 'B']);
  });

  it('conserva el orden en que salieron', () => {
    const vigentes = paresVigentesDeLaVenta([
      { quantity: -24, unitBarcodes: ['B'] },
      { quantity: -24, unitBarcodes: ['A', 'B'] },
      { quantity: -24, unitBarcodes: ['A'] },
    ]);
    expect(vigentes).toEqual(['B', 'A']);
  });

  it('lo que volvió sigue sin contar', () => {
    const vigentes = paresVigentesDeLaVenta([
      { quantity: -24, unitBarcodes: ['A'] },
      { quantity: -24, unitBarcodes: ['A'] },
      { quantity: 48, unitBarcodes: ['A', 'A'] },
    ]);
    expect(vigentes).toEqual([]);
  });
});
