import {
  resumenPorPatinador,
  DespachoDeReporte,
} from './street-reporte.js';

const item = (o: Partial<DespachoDeReporte['items'][number]>) => ({
  quantity: 0,
  quantitySold: 0,
  quantityReturned: 0,
  unitPriceCents: 0,
  unitCostCents: 0,
  ...o,
});

describe('resumenPorPatinador', () => {
  it('suma lo sacado, vendido, devuelto y lo que queda en calle por persona', () => {
    const despachos: DespachoDeReporte[] = [
      {
        sellerId: 'a',
        sellerName: 'Ana',
        status: 'OPEN',
        collectedAmountCents: null,
        items: [
          item({ quantity: 10, quantitySold: 3, quantityReturned: 2, unitPriceCents: 5000, unitCostCents: 3000 }),
        ],
      },
      {
        sellerId: 'a',
        sellerName: 'Ana',
        status: 'SETTLED',
        collectedAmountCents: 20000,
        items: [
          item({ quantity: 5, quantitySold: 5, quantityReturned: 0, unitPriceCents: 5000, unitCostCents: 3000 }),
        ],
      },
    ];
    const { filas } = resumenPorPatinador(despachos);
    expect(filas).toHaveLength(1);
    const ana = filas[0];
    expect(ana.despachos).toBe(2);
    expect(ana.despachadas).toBe(15);
    expect(ana.vendidas).toBe(8);
    expect(ana.devueltas).toBe(2);
    // En calle solo del despacho OPEN: 10 - 3 - 2 = 5.
    expect(ana.enCalle).toBe(5);
    expect(ana.ingresosCents).toBe(8 * 5000);
    expect(ana.recaudadoCents).toBe(20000);
    // Ganancia: 8 vendidas × (5000 - 3000).
    expect(ana.gananciaCents).toBe(8 * 2000);
    expect(ana.sinCosto).toBe(false);
  });

  it('ignora los despachos cancelados', () => {
    const { filas, totales } = resumenPorPatinador([
      {
        sellerId: 'a',
        sellerName: 'Ana',
        status: 'CANCELLED',
        collectedAmountCents: null,
        items: [item({ quantity: 9, unitPriceCents: 100 })],
      },
    ]);
    expect(filas).toHaveLength(0);
    expect(totales.despachadas).toBe(0);
  });

  it('marca sinCosto cuando una venta no tiene costo registrado', () => {
    const { filas } = resumenPorPatinador([
      {
        sellerId: 'b',
        sellerName: 'Beto',
        status: 'SETTLED',
        collectedAmountCents: 5000,
        items: [item({ quantity: 2, quantitySold: 1, unitPriceCents: 5000, unitCostCents: 0 })],
      },
    ]);
    expect(filas[0].sinCosto).toBe(true);
    expect(filas[0].gananciaCents).toBe(0); // no se cuenta ganancia sin costo
  });

  it('ordena de mayor a menor por lo vendido', () => {
    const { filas } = resumenPorPatinador([
      {
        sellerId: 'a',
        sellerName: 'Ana',
        status: 'SETTLED',
        collectedAmountCents: 0,
        items: [item({ quantity: 2, quantitySold: 1, unitPriceCents: 100 })],
      },
      {
        sellerId: 'b',
        sellerName: 'Beto',
        status: 'SETTLED',
        collectedAmountCents: 0,
        items: [item({ quantity: 9, quantitySold: 9, unitPriceCents: 100 })],
      },
    ]);
    expect(filas.map((f) => f.sellerName)).toEqual(['Beto', 'Ana']);
  });

  it('el saldo sin vender de un despacho liquidado NO cuenta como en calle', () => {
    const { filas } = resumenPorPatinador([
      {
        sellerId: 'a',
        sellerName: 'Ana',
        status: 'SETTLED',
        collectedAmountCents: 0,
        items: [item({ quantity: 10, quantitySold: 4, quantityReturned: 4, unitPriceCents: 100 })],
      },
    ]);
    expect(filas[0].enCalle).toBe(0);
  });
});
