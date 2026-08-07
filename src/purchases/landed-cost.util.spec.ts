import { calculateLandedCost } from './landed-cost.util.js';

describe('calculateLandedCost', () => {
  it('sin tasa ni fletes, el costo puesto en bodega es el del proveedor', () => {
    const r = calculateLandedCost([
      { id: 'a', units: 10, unitCost: 1000 },
      { id: 'b', units: 5, unitCost: 2000 },
    ]);

    expect(r.totalUnits).toBe(15);
    expect(r.goodsTotal).toBe(20_000);
    expect(r.landedTotal).toBe(20_000);
    expect(r.lines[0].landedUnitCost).toBe(1000);
    expect(r.lines[1].landedUnitCost).toBe(2000);
  });

  it('aplica la tasa de cambio al costo del proveedor', () => {
    const r = calculateLandedCost([{ id: 'a', units: 2, unitCost: 10 }], {
      exchangeRate: 4000,
    });

    expect(r.lines[0].baseUnitCost).toBe(40_000);
    expect(r.landedTotal).toBe(80_000);
  });

  it('reparte el flete por unidades: cada unidad carga lo mismo', () => {
    // 30 unidades y $30.000 de flete => $1.000 por unidad.
    const r = calculateLandedCost(
      [
        { id: 'a', units: 10, unitCost: 5000 },
        { id: 'b', units: 20, unitCost: 5000 },
      ],
      { freightCosts: [{ label: 'Naviera', amount: 30_000 }] },
    );

    expect(r.lines[0].freightShare).toBe(10_000);
    expect(r.lines[1].freightShare).toBe(20_000);
    expect(r.lines[0].landedUnitCost).toBe(6000);
    expect(r.lines[1].landedUnitCost).toBe(6000);
  });

  it('suma varios conceptos de flete', () => {
    const r = calculateLandedCost([{ id: 'a', units: 10, unitCost: 0 }], {
      freightCosts: [
        { label: 'Naviera', amount: 1000 },
        { label: 'Aduana', amount: 500 },
        { label: 'Transporte interno', amount: 500 },
      ],
    });

    expect(r.freightTotal).toBe(2000);
    expect(r.lines[0].landedUnitCost).toBe(200);
  });

  // Por unidades, una unidad cara y una barata cargan el mismo flete; por
  // valor, la cara carga más. Es la diferencia entre los dos criterios.
  it('por valor, el flete pesa más sobre lo caro', () => {
    const lines = [
      { id: 'barato', units: 10, unitCost: 100 },
      { id: 'caro', units: 10, unitCost: 900 },
    ];

    const porUnidades = calculateLandedCost(lines, {
      freightCosts: [{ label: 'F', amount: 10_000 }],
      allocation: 'BY_UNITS',
    });
    expect(porUnidades.lines[0].freightShare).toBe(5000);
    expect(porUnidades.lines[1].freightShare).toBe(5000);

    const porValor = calculateLandedCost(lines, {
      freightCosts: [{ label: 'F', amount: 10_000 }],
      allocation: 'BY_VALUE',
    });
    expect(porValor.lines[0].freightShare).toBe(1000);
    expect(porValor.lines[1].freightShare).toBe(9000);
  });

  // El flete pagado debe quedar repartido completo: si el redondeo por línea
  // deja céntimos sueltos, se ajustan. Si no, el costeo no cuadra con la caja.
  it('no pierde ni inventa centavos al repartir un flete indivisible', () => {
    const r = calculateLandedCost(
      [
        { id: 'a', units: 3, unitCost: 0 },
        { id: 'b', units: 3, unitCost: 0 },
        { id: 'c', units: 3, unitCost: 0 },
      ],
      { freightCosts: [{ label: 'F', amount: 100 }] },
    );

    const suma = r.lines.reduce((s, l) => s + l.freightShare, 0);
    expect(Math.round(suma * 100) / 100).toBe(100);
  });

  it('reparte correctamente con cantidades desiguales', () => {
    const r = calculateLandedCost(
      [
        { id: 'a', units: 1, unitCost: 0 },
        { id: 'b', units: 2, unitCost: 0 },
      ],
      { freightCosts: [{ label: 'F', amount: 90 }] },
    );

    expect(r.lines[0].freightShare).toBe(30);
    expect(r.lines[1].freightShare).toBe(60);
  });

  it('combina tasa de cambio y flete', () => {
    // 10 unidades a USD 10 con tasa 4.000 => $400.000 de mercancía.
    // Flete $100.000 entre 10 unidades => $10.000 por unidad.
    const r = calculateLandedCost([{ id: 'a', units: 10, unitCost: 10 }], {
      exchangeRate: 4000,
      freightCosts: [{ label: 'Naviera', amount: 100_000 }],
    });

    expect(r.goodsTotal).toBe(400_000);
    expect(r.landedTotal).toBe(500_000);
    expect(r.lines[0].landedUnitCost).toBe(50_000);
  });

  describe('casos límite', () => {
    it('sin unidades no divide por cero', () => {
      const r = calculateLandedCost([{ id: 'a', units: 0, unitCost: 100 }], {
        freightCosts: [{ label: 'F', amount: 500 }],
      });

      expect(r.totalUnits).toBe(0);
      expect(r.lines[0].freightShare).toBe(0);
      expect(r.landedTotal).toBe(500);
    });

    it('sin líneas devuelve solo el flete', () => {
      const r = calculateLandedCost([], {
        freightCosts: [{ label: 'F', amount: 500 }],
      });
      expect(r.lines).toEqual([]);
      expect(r.landedTotal).toBe(500);
    });

    it('una tasa inválida se trata como 1, no anula el costo', () => {
      expect(
        calculateLandedCost([{ id: 'a', units: 1, unitCost: 100 }], {
          exchangeRate: 0,
        }).lines[0].landedUnitCost,
      ).toBe(100);
    });

    // Repartir por valor cuando todo vale 0 dejaría el flete sin asignar.
    it('al repartir por valor con todo en cero, cae a unidades', () => {
      const r = calculateLandedCost(
        [
          { id: 'a', units: 5, unitCost: 0 },
          { id: 'b', units: 5, unitCost: 0 },
        ],
        {
          freightCosts: [{ label: 'F', amount: 100 }],
          allocation: 'BY_VALUE',
        },
      );

      expect(r.lines[0].freightShare).toBe(50);
      expect(r.lines[1].freightShare).toBe(50);
    });

    it('no arrastra errores de coma flotante', () => {
      const r = calculateLandedCost([{ id: 'a', units: 3, unitCost: 0.1 }], {
        freightCosts: [{ label: 'F', amount: 0.2 }],
      });
      expect(r.landedTotal).toBe(0.5);
    });
  });
});
