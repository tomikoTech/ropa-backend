import {
  descuentoDelRenglon,
  resumenDelDescuento,
  rotuloDelDescuento,
  textoDelPorcentaje,
} from './descuento-de-la-factura.js';

/**
 * El Excel de Jefferson, hecho regla: un estuche a 60.000 con 15 % se cobra
 * en 51.000 y la factura tiene que decir las dos cifras y el porcentaje.
 */
describe('descuentoDelRenglon', () => {
  it('descuento por línea: tacha el unitario y cobra el rebajado', () => {
    const d = descuentoDelRenglon({
      cantidad: 2,
      precioUnitario: 60_000,
      descuentoPorcentaje: 15,
    });
    expect(d).toEqual({
      lista: 60_000,
      cobrado: 51_000,
      porcentaje: 15,
      ahorro: 18_000,
      tieneDescuento: true,
    });
  });

  it('precio editado a mano por debajo de la lista: la rebaja es la diferencia', () => {
    // Andrea le puso 27.000 a lo que vale 30.000 «porque le ofrecí un precio
    // neto»: no hay porcentaje guardado, pero sí hubo descuento.
    const d = descuentoDelRenglon({
      cantidad: 1,
      precioUnitario: 27_000,
      precioDeLista: 30_000,
    });
    expect(d.lista).toBe(30_000);
    expect(d.cobrado).toBe(27_000);
    expect(d.porcentaje).toBe(10);
    expect(d.ahorro).toBe(3_000);
  });

  it('lista y porcentaje a la vez: se suman las dos rebajas', () => {
    const d = descuentoDelRenglon({
      cantidad: 1,
      precioUnitario: 27_000,
      precioDeLista: 30_000,
      descuentoPorcentaje: 10,
    });
    expect(d.cobrado).toBe(24_300);
    expect(d.ahorro).toBe(5_700);
    expect(d.porcentaje).toBe(19);
  });

  it('vendido por encima de la lista no es descuento', () => {
    const d = descuentoDelRenglon({
      cantidad: 1,
      precioUnitario: 35_000,
      precioDeLista: 30_000,
    });
    expect(d.tieneDescuento).toBe(false);
    expect(d.lista).toBe(35_000);
    expect(d.ahorro).toBe(0);
  });

  it('sin lista ni porcentaje no hay nada que tachar', () => {
    const d = descuentoDelRenglon({ cantidad: 3, precioUnitario: 10_000 });
    expect(d.tieneDescuento).toBe(false);
    expect(d.porcentaje).toBe(0);
  });

  it('el porcentaje queda con un decimal cuando no es redondo', () => {
    const d = descuentoDelRenglon({
      cantidad: 1,
      precioUnitario: 40_000,
      precioDeLista: 45_000,
    });
    expect(d.porcentaje).toBe(11.1);
    expect(textoDelPorcentaje(d.porcentaje)).toBe('11,1 %');
  });
});

describe('resumenDelDescuento', () => {
  it('descuento general solo (las 485 ventas de Distri Amber)', () => {
    const r = resumenDelDescuento(
      [{ cantidad: 2, precioUnitario: 40_000, precioDeLista: 40_000 }],
      12_000,
    );
    expect(r.subtotalDeLista).toBe(80_000);
    expect(r.descuentoDeRenglones).toBe(0);
    expect(r.descuentoGeneral).toBe(12_000);
    expect(r.descuento).toBe(12_000);
    expect(r.porcentaje).toBe(15);
    expect(r.frase).toBe('Se te aplicó un descuento total de $12.000 (15 %)');
    expect(rotuloDelDescuento(r)).toBe('Descuento 15 %');
  });

  it('mezcla: renglón con 15 %, otro editado a mano y descuento general', () => {
    const r = resumenDelDescuento(
      [
        { cantidad: 1, precioUnitario: 60_000, descuentoPorcentaje: 15 },
        { cantidad: 1, precioUnitario: 27_000, precioDeLista: 30_000 },
        { cantidad: 1, precioUnitario: 10_000 },
      ],
      // La venta guarda la rebaja total: 12.000 de los renglones + 5.000 generales.
      17_000,
    );
    expect(r.subtotalDeLista).toBe(100_000);
    expect(r.descuentoDeRenglones).toBe(12_000);
    expect(r.descuentoGeneral).toBe(5_000);
    expect(r.descuento).toBe(17_000);
    expect(r.porcentaje).toBe(17);
  });

  it('el POS guarda en discount_amount la suma de las líneas: no se cuenta dos veces (FE-000810)', () => {
    const r = resumenDelDescuento(
      [
        {
          cantidad: 8,
          precioUnitario: 38_000,
          precioDeLista: 38_000,
          descuentoPorcentaje: 20,
        },
        {
          cantidad: 6,
          precioUnitario: 62_400,
          precioDeLista: 62_400,
          descuentoPorcentaje: 20,
        },
      ],
      (8 * 38_000 + 6 * 62_400) * 0.2,
    );
    expect(r.subtotalDeLista).toBe(678_400);
    expect(r.descuentoDeRenglones).toBe(135_680);
    expect(r.descuentoGeneral).toBe(0);
    expect(r.descuento).toBe(135_680);
    expect(r.porcentaje).toBe(20);
  });

  it('un precio pactado no diluye el porcentaje (FE-000815: 20 % y Yum Yum a 50.000)', () => {
    const al20 = (precio: number) => ({
      cantidad: 6,
      precioUnitario: precio,
      precioDeLista: precio,
      descuentoPorcentaje: 20,
    });
    const r = resumenDelDescuento(
      [
        al20(40_000),
        al20(28_900),
        al20(30_000),
        al20(35_000),
        al20(30_000),
        al20(33_400),
        // Pactado: la venta guardó 50.000 también como lista.
        {
          cantidad: 16,
          precioUnitario: 50_000,
          precioDeLista: 50_000,
          descuentoPorcentaje: 0,
        },
      ],
      236_760,
    );
    expect(r.subtotalDeLista).toBe(6 * 197_300 + 16 * 50_000);
    expect(r.descuento).toBe(236_760);
    expect(r.descuentoGeneral).toBe(0);
    expect(r.porcentaje).toBe(20);
    expect(rotuloDelDescuento(r)).toBe('Descuento 20 %');
    expect(r.frase).toBe('Se te aplicó un descuento total de $236.760 (20 %)');
  });

  it('con porcentajes distintos por renglón, el del pie vuelve a ser el global', () => {
    const r = resumenDelDescuento(
      [
        { cantidad: 1, precioUnitario: 100_000, descuentoPorcentaje: 20 },
        { cantidad: 1, precioUnitario: 100_000, descuentoPorcentaje: 10 },
      ],
      30_000,
    );
    expect(r.porcentaje).toBe(15);
  });

  it('sin descuento no hay frase ni porcentaje', () => {
    const r = resumenDelDescuento([{ cantidad: 1, precioUnitario: 10_000 }], 0);
    expect(r.descuento).toBe(0);
    expect(r.frase).toBeNull();
    expect(rotuloDelDescuento(r)).toBe('Descuento');
  });

  it('un descuento general negativo o nulo cuenta como cero', () => {
    expect(
      resumenDelDescuento([{ cantidad: 1, precioUnitario: 10_000 }], -500)
        .descuento,
    ).toBe(0);
    expect(
      resumenDelDescuento([{ cantidad: 1, precioUnitario: 10_000 }], null)
        .descuento,
    ).toBe(0);
  });

  it('sin renglones (venta solo de terceros) no se cae', () => {
    const r = resumenDelDescuento([], 0);
    expect(r.subtotalDeLista).toBe(0);
    expect(r.porcentaje).toBe(0);
  });
});
