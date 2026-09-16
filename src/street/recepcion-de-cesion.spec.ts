import {
  aplicarRecepcion,
  deltasDesdeTotales,
  enPrestamo,
  estadoDelRenglon,
  todoRecibido,
  validarRecepcion,
  type RenglonCedido,
} from './recepcion-de-cesion.js';

const renglon = (x: Partial<RenglonCedido>): RenglonCedido => ({
  id: 'a',
  productName: 'Runner',
  variantSize: '41',
  variantColor: 'Negro',
  quantity: 1,
  quantitySold: 0,
  quantityReturned: 0,
  ...x,
});

describe('recibir una cesión por partes', () => {
  it('cada renglón dice si está en préstamo, volvió, se vendió o va a medias', () => {
    expect(estadoDelRenglon(renglon({}))).toBe('EN_PRESTAMO');
    expect(estadoDelRenglon(renglon({ quantityReturned: 1 }))).toBe('VOLVIO');
    expect(estadoDelRenglon(renglon({ quantitySold: 1 }))).toBe('VENDIDO');
    expect(
      estadoDelRenglon(
        renglon({ quantity: 6, quantitySold: 2, quantityReturned: 1 }),
      ),
    ).toBe('PARCIAL');
    expect(
      estadoDelRenglon(
        renglon({ quantity: 6, quantitySold: 4, quantityReturned: 2 }),
      ),
    ).toBe('PARCIAL');
    expect(
      enPrestamo(
        renglon({ quantity: 6, quantitySold: 2, quantityReturned: 1 }),
      ),
    ).toBe(3);
  });

  it('no hace falta declarar todos los renglones: lo que no llega sigue prestado', () => {
    const renglones = [
      renglon({ id: 'a' }),
      renglon({ id: 'b', productName: 'Court' }),
    ];
    expect(
      validarRecepcion(renglones, [{ itemId: 'a', sold: 0, returned: 1 }]),
    ).toEqual([]);
    const despues = aplicarRecepcion(renglones, [
      { itemId: 'a', sold: 0, returned: 1 },
    ]);
    expect(estadoDelRenglon(despues[0])).toBe('VOLVIO');
    expect(estadoDelRenglon(despues[1])).toBe('EN_PRESTAMO');
    expect(todoRecibido(despues)).toBe(false);
  });

  it('no se puede recibir más de lo que sigue en préstamo', () => {
    const r = renglon({ id: 'a', quantity: 6, quantitySold: 4 });
    const errores = validarRecepcion(
      [r],
      [{ itemId: 'a', sold: 1, returned: 2 }],
    );
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/quedan 2 en préstamo/);
  });

  it('recibir nada es un error, no un cierre', () => {
    expect(
      validarRecepcion([renglon({})], [{ itemId: 'a', sold: 0, returned: 0 }]),
    ).toEqual([
      'No hay nada que recibir: escribe cuánto volvió o cuánto se vendió.',
    ]);
  });

  it('cuando ya no queda nada afuera, la cesión se puede cerrar sola', () => {
    const despues = aplicarRecepcion(
      [renglon({ id: 'a', quantity: 2 }), renglon({ id: 'b' })],
      [
        { itemId: 'a', sold: 1, returned: 1 },
        { itemId: 'b', sold: 1, returned: 0 },
      ],
    );
    expect(todoRecibido(despues)).toBe(true);
  });

  it('el cuadre de totales de la pantalla vieja se traduce a lo que llega ahora', () => {
    const r = renglon({
      id: 'a',
      quantity: 6,
      quantitySold: 2,
      quantityReturned: 1,
    });
    expect(
      deltasDesdeTotales([r], [{ itemId: 'a', sold: 4, returned: 1 }]),
    ).toEqual([{ itemId: 'a', sold: 2, returned: 0 }]);
  });
});
