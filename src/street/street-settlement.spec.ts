import {
  buildSellerCode,
  looksLikeSellerCode,
  settlementSummary,
  validateSettlement,
  SELLER_CODE_LIMIT,
  type DispatchedItem,
} from './street-settlement.js';
import { isValidBarcode } from '../inventory/barcode.util.js';

const item = (over: Partial<DispatchedItem> = {}): DispatchedItem => ({
  id: 'i1',
  productName: 'Bota Chelsea',
  variantSize: '40',
  variantColor: 'Negro',
  quantity: 5,
  unitPrice: 100000,
  unitCost: 60000,
  ...over,
});

describe('carnet del patinador', () => {
  it('lo lee el mismo lector: trae dígito verificador EAN válido', () => {
    // Es lo que permite no comprar equipo nuevo, y que una lectura mala se
    // detecte en vez de traer al patinador equivocado.
    for (const seq of [1, 7, 42, 1234, SELLER_CODE_LIMIT]) {
      expect(isValidBarcode(buildSellerCode(seq))).toBe(true);
    }
  });

  it('se distingue a simple vista de un código de mercancía', () => {
    // Los bultos empiezan con el año (26…); el carnet con 77.
    expect(buildSellerCode(1).startsWith('77')).toBe(true);
    expect(buildSellerCode(1)).toHaveLength(9);
  });

  it('cada consecutivo da un código distinto', () => {
    const codigos = new Set([1, 2, 3, 10, 100].map(buildSellerCode));
    expect(codigos.size).toBe(5);
  });

  it('avisa cuando el consecutivo ya no cabe, en vez de emitir carnets repetidos', () => {
    expect(() => buildSellerCode(SELLER_CODE_LIMIT + 1)).toThrow(/no caben/i);
  });

  it('rechaza consecutivos que no son enteros positivos', () => {
    expect(() => buildSellerCode(0)).toThrow();
    expect(() => buildSellerCode(-1)).toThrow();
    expect(() => buildSellerCode(1.5)).toThrow();
  });

  it('reconoce la forma de un carnet antes de ir a buscarlo', () => {
    expect(looksLikeSellerCode(buildSellerCode(9))).toBe(true);
    expect(looksLikeSellerCode('  ' + buildSellerCode(9) + ' ')).toBe(true);
    // Un código de bulto de 17 dígitos no es un carnet.
    expect(looksLikeSellerCode('26080700290010011')).toBe(false);
    expect(looksLikeSellerCode('PA-1')).toBe(false);
    expect(looksLikeSellerCode('')).toBe(false);
  });
});

describe('validateSettlement', () => {
  it('acepta una conciliación que cuadra', () => {
    expect(
      validateSettlement([item()], [{ itemId: 'i1', sold: 3, returned: 2 }]),
    ).toEqual([]);
  });

  it('acepta que falte mercancía (queda registrada como faltante)', () => {
    // Vendió 2, devolvió 1, se perdieron 2: el sistema lo deja pasar pero lo
    // registra. Rechazarlo obligaría a mentir para poder cerrar la remisión.
    expect(
      validateSettlement([item()], [{ itemId: 'i1', sold: 2, returned: 1 }]),
    ).toEqual([]);
  });

  it('rechaza que vendido y devuelto sumen más de lo despachado', () => {
    const errores = validateSettlement(
      [item()],
      [{ itemId: 'i1', sold: 4, returned: 3 }],
    );
    expect(errores).toHaveLength(1);
    // El mensaje nombra el producto y las cifras, no "el ítem 3".
    expect(errores[0]).toContain('Bota Chelsea 40/Negro');
    expect(errores[0]).toContain('7');
    expect(errores[0]).toContain('5');
  });

  it('rechaza cantidades negativas', () => {
    const errores = validateSettlement(
      [item()],
      [{ itemId: 'i1', sold: -1, returned: 0 }],
    );
    expect(errores[0]).toContain('no puede ser negativo');
  });

  it('devuelve TODOS los problemas, no el primero', () => {
    // Quien está cuadrando frente al patinador necesita la lista completa para
    // corregirla de una sola vez.
    const errores = validateSettlement(
      [item({ id: 'a' }), item({ id: 'b', productName: 'Sandalia' })],
      [
        { itemId: 'a', sold: 9, returned: 0 },
        { itemId: 'b', sold: -2, returned: 0 },
      ],
    );
    expect(errores.length).toBeGreaterThanOrEqual(2);
  });

  it('exige cuadrar todos los renglones y dice cuáles faltan', () => {
    const errores = validateSettlement(
      [item({ id: 'a' }), item({ id: 'b', productName: 'Sandalia' })],
      [{ itemId: 'a', sold: 5, returned: 0 }],
    );
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('Sandalia');
    expect(errores[0]).toContain('0 y 0');
  });

  it('rechaza un renglón repetido y uno que no es de la remisión', () => {
    expect(
      validateSettlement(
        [item()],
        [
          { itemId: 'i1', sold: 1, returned: 0 },
          { itemId: 'i1', sold: 1, returned: 0 },
        ],
      )[0],
    ).toContain('dos veces');

    expect(
      validateSettlement(
        [item()],
        [{ itemId: 'otro', sold: 1, returned: 0 }],
      ).join(' '),
    ).toContain('no pertenece');
  });
});

describe('settlementSummary', () => {
  it('cuadra lo despachado con lo vendido, lo devuelto y lo que falta', () => {
    const s = settlementSummary(
      [item({ quantity: 5, unitPrice: 100000, unitCost: 60000 })],
      [{ itemId: 'i1', sold: 3, returned: 1 }],
    );
    expect(s.dispatched).toBe(5);
    expect(s.sold).toBe(3);
    expect(s.returned).toBe(1);
    expect(s.missing).toBe(1);
    expect(s.revenue).toBe(300000);
    expect(s.cost).toBe(180000);
    expect(s.profit).toBe(120000);
    // El faltante se valora aparte: no se come la utilidad en silencio.
    expect(s.missingValue).toBe(100000);
  });

  it('sin faltantes, lo despachado es vendido más devuelto', () => {
    const s = settlementSummary(
      [item({ quantity: 4 })],
      [{ itemId: 'i1', sold: 4, returned: 0 }],
    );
    expect(s.missing).toBe(0);
    expect(s.missingValue).toBe(0);
  });

  it('usa lo ya registrado cuando no se le pasan líneas', () => {
    // Es lo que permite mostrar el resumen de una remisión ya conciliada.
    const s = settlementSummary([
      { ...item({ quantity: 5 }), quantitySold: 2, quantityReturned: 3 },
    ]);
    expect(s.sold).toBe(2);
    expect(s.returned).toBe(3);
    expect(s.revenue).toBe(200000);
  });

  it('una remisión recién despachada no tiene nada vendido', () => {
    const s = settlementSummary([item({ quantity: 6 })]);
    expect(s.dispatched).toBe(6);
    expect(s.sold).toBe(0);
    expect(s.missing).toBe(6);
    expect(s.profit).toBe(0);
  });

  it('suma varios renglones', () => {
    const s = settlementSummary(
      [
        item({ id: 'a', quantity: 2, unitPrice: 50000, unitCost: 20000 }),
        item({ id: 'b', quantity: 3, unitPrice: 30000, unitCost: 10000 }),
      ],
      [
        { itemId: 'a', sold: 2, returned: 0 },
        { itemId: 'b', sold: 1, returned: 2 },
      ],
    );
    expect(s.dispatched).toBe(5);
    expect(s.revenue).toBe(130000);
    expect(s.cost).toBe(50000);
    expect(s.profit).toBe(80000);
  });

  it('redondea a pesos y no arrastra centavos binarios', () => {
    const s = settlementSummary(
      [item({ quantity: 3, unitPrice: 33333.33, unitCost: 11111.11 })],
      [{ itemId: 'i1', sold: 3, returned: 0 }],
    );
    expect(s.revenue).toBe(99999.99);
    expect(s.profit).toBe(66666.66);
  });
});
