import { emparejarRenglones } from './emparejar-renglones';

const caja = (variantId: string, stockUnitId: string) => ({
  variantId,
  quantity: 24,
  stockUnitId,
});

describe('emparejarRenglones', () => {
  const V = 'variante-tulua';

  it('empareja por el código, no por la posición en la lista', () => {
    const anteriores = [caja(V, 'c1'), caja(V, 'c2'), caja(V, 'c3')];
    // La misma venta, reenviada al revés: es lo que hace la pantalla cuando
    // reordena los renglones.
    const pedidos = [
      { variantId: V, quantity: 24, stockUnitIds: ['c3'] },
      { variantId: V, quantity: 24, stockUnitIds: ['c2'] },
      { variantId: V, quantity: 24, stockUnitIds: ['c1'] },
    ];
    expect(emparejarRenglones(pedidos, anteriores)).toEqual([
      { anterior: 2, conservaElCodigo: true },
      { anterior: 1, conservaElCodigo: true },
      { anterior: 0, conservaElCodigo: true },
    ]);
  });

  it('el que anexa una caja nueva no se queda con el código de otro', () => {
    // El caso del 11 de septiembre: dos cajas iguales y se anexa una tercera.
    const anteriores = [caja(V, 'c1'), caja(V, 'c2')];
    const pedidos = [
      { variantId: V, quantity: 24, stockUnitIds: ['c1'] },
      { variantId: V, quantity: 24, stockUnitIds: ['c2'] },
      { variantId: V, quantity: 24, stockUnitIds: ['c3'] },
    ];
    const resultado = emparejarRenglones(pedidos, anteriores);
    expect(resultado[0]).toEqual({ anterior: 0, conservaElCodigo: true });
    expect(resultado[1]).toEqual({ anterior: 1, conservaElCodigo: true });
    // No hay anterior libre: la caja nueva la resuelve el inventario.
    expect(resultado[2]).toEqual({ anterior: null, conservaElCodigo: false });
  });

  it('la caja anexada no roba el snapshot aunque quede un anterior libre', () => {
    // Tres renglones anteriores, dos pedidos: uno pide su caja, el otro anexa.
    const anteriores = [caja(V, 'c1'), caja(V, 'c2')];
    const pedidos = [
      { variantId: V, quantity: 24, stockUnitIds: ['c9'] },
      { variantId: V, quantity: 24, stockUnitIds: ['c1'] },
    ];
    const resultado = emparejarRenglones(pedidos, anteriores);
    // El que pide c1 se queda con su renglón, aunque venga de segundo.
    expect(resultado[1]).toEqual({ anterior: 0, conservaElCodigo: true });
    // El que anexa hereda el IVA del que sobró, pero no su código.
    expect(resultado[0]).toEqual({ anterior: 1, conservaElCodigo: false });
  });

  it('sin códigos, sigue emparejando por variante y cantidad', () => {
    const anteriores = [
      { variantId: 'a', quantity: 3, stockUnitId: null },
      { variantId: 'b', quantity: 1, stockUnitId: null },
    ];
    const pedidos = [
      { variantId: 'b', quantity: 1 },
      { variantId: 'a', quantity: 3 },
    ];
    expect(emparejarRenglones(pedidos, anteriores)).toEqual([
      { anterior: 1, conservaElCodigo: true },
      { anterior: 0, conservaElCodigo: true },
    ]);
  });

  it('cambiar la cantidad hereda el snapshot pero no el código', () => {
    // La caja pasó a ser tres pares sueltos: el código de la caja ya no aplica.
    const anteriores = [caja('a', 'c1')];
    const pedidos = [{ variantId: 'a', quantity: 3 }];
    expect(emparejarRenglones(pedidos, anteriores)).toEqual([
      { anterior: 0, conservaElCodigo: false },
    ]);
  });

  it('ningún anterior se usa dos veces', () => {
    const anteriores = [caja(V, 'c1')];
    const pedidos = [
      { variantId: V, quantity: 24, stockUnitIds: ['c1'] },
      { variantId: V, quantity: 24, stockUnitIds: ['c1'] },
    ];
    const resultado = emparejarRenglones(pedidos, anteriores);
    expect(resultado[0].anterior).toBe(0);
    expect(resultado[1].anterior).toBeNull();
  });

  it('una venta sin renglones anteriores empareja con nada', () => {
    const pedidos = [{ variantId: V, quantity: 24, stockUnitIds: ['c1'] }];
    expect(emparejarRenglones(pedidos, [])).toEqual([
      { anterior: null, conservaElCodigo: false },
    ]);
  });

  it('las cincuenta y tres cajas iguales conservan cada una la suya', () => {
    // La factura que reventó. Reenviada entera, más una que se anexa.
    const anteriores = Array.from({ length: 53 }, (_, i) => caja(V, `c${i}`));
    const pedidos = [
      ...Array.from({ length: 53 }, (_, i) => ({
        variantId: V,
        quantity: 24,
        stockUnitIds: [`c${i}`],
      })),
      { variantId: V, quantity: 24, stockUnitIds: ['nueva'] },
    ];
    const resultado = emparejarRenglones(pedidos, anteriores);
    resultado.slice(0, 53).forEach((e, i) => {
      expect(e).toEqual({ anterior: i, conservaElCodigo: true });
    });
    expect(resultado[53]).toEqual({ anterior: null, conservaElCodigo: false });
  });
});
