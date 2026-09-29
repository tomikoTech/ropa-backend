import { precioDeLinea, type ReglaDePrecio } from './precio-de-linea.js';

/**
 * Qué precio lleva un renglón de la venta.
 *
 * Hay tres reglas y se pisan entre sí, así que el orden importa:
 *
 *  - **Precio fijo**: el producto se vende a ese valor y punto. «Las cajas que
 *    yo vendo, si tienen un precio, eso no tiene descuento para nadie».
 *  - **Precio mínimo**: un piso. El vendedor puede subir, no bajar.
 *  - **Precio sugerido**: el de la variante si lo tiene, si no el del producto.
 *    Es lo que se propone, pero el vendedor lo puede cambiar.
 *
 * Vive aparte del servicio porque es la regla que decide cuánta plata entra, y
 * eso hay que poder probarlo hasta el último caso raro.
 */

const base = (extra: Partial<ReglaDePrecio> = {}): ReglaDePrecio => ({
  precioProducto: 100_000,
  precioVariante: null,
  precioMinimo: null,
  precioFijo: false,
  ...extra,
});

describe('precioDeLinea', () => {
  describe('sin reglas especiales', () => {
    it('propone el del producto cuando no mandan nada', () => {
      expect(precioDeLinea(base(), { unitPrice: undefined })).toEqual({
        precio: 100_000,
      });
    });

    it('la variante manda sobre el producto', () => {
      expect(
        precioDeLinea(base({ precioVariante: 120_000 }), {
          unitPrice: undefined,
        }),
      ).toEqual({ precio: 120_000 });
    });

    it('deja cambiarlo, que para eso se negocia', () => {
      expect(precioDeLinea(base(), { unitPrice: 90_000 })).toEqual({
        precio: 90_000,
      });
    });

    it('acepta regalarlo: cero es un precio', () => {
      // Pasa de verdad —una garantía, un obsequio— y bloquearlo obliga a la
      // tienda a inventar una venta por fuera del sistema.
      expect(precioDeLinea(base(), { unitPrice: 0 })).toEqual({ precio: 0 });
    });

    it('un precio negativo no es un descuento: se rechaza', () => {
      const r = precioDeLinea(base(), { unitPrice: -1 });
      expect(r.error).toContain('negativo');
    });
  });

  describe('precio mínimo', () => {
    it('deja vender por encima', () => {
      expect(
        precioDeLinea(base({ precioMinimo: 80_000 }), { unitPrice: 85_000 }),
      ).toEqual({ precio: 85_000 });
    });

    it('deja vender justo en el mínimo', () => {
      expect(
        precioDeLinea(base({ precioMinimo: 80_000 }), { unitPrice: 80_000 }),
      ).toEqual({ precio: 80_000 });
    });

    it('no deja bajar de ahí', () => {
      const r = precioDeLinea(base({ precioMinimo: 80_000 }), {
        unitPrice: 79_999,
      });
      expect(r.error).toContain('80.000');
    });

    it('mira el precio **con** el descuento, no el de lista', () => {
      // Sin esto, poner el precio de lista y un 50% de descuento se salta el
      // mínimo por la puerta de atrás.
      const r = precioDeLinea(base({ precioMinimo: 80_000 }), {
        unitPrice: 100_000,
        discountPercent: 50,
      });
      expect(r.error).toContain('80.000');
    });
  });

  describe('precio fijo', () => {
    const fijo = base({ precioFijo: true, precioProducto: 50_000 });

    it('vale el del producto cuando no mandan nada', () => {
      expect(precioDeLinea(fijo, { unitPrice: undefined })).toEqual({
        precio: 50_000,
      });
    });

    it('acepta que manden exactamente ese', () => {
      expect(precioDeLinea(fijo, { unitPrice: 50_000 })).toEqual({
        precio: 50_000,
      });
    });

    it('no deja bajarlo', () => {
      const r = precioDeLinea(fijo, { unitPrice: 45_000 });
      expect(r.error).toContain('precio fijo');
    });

    it('tampoco deja subirlo', () => {
      // No es un mínimo: es un precio. Subirlo también lo rompe.
      const r = precioDeLinea(fijo, { unitPrice: 60_000 });
      expect(r.error).toContain('precio fijo');
    });

    it('no admite descuento, que es bajarlo por otro camino', () => {
      const r = precioDeLinea(fijo, { unitPrice: 50_000, discountPercent: 10 });
      expect(r.error).toContain('descuento');
    });

    it('un descuento de cero sí, que es no descontar', () => {
      expect(
        precioDeLinea(fijo, { unitPrice: 50_000, discountPercent: 0 }),
      ).toEqual({ precio: 50_000 });
    });

    it('la variante manda también aquí', () => {
      // Una talla puede costar distinto; lo fijo es que no se negocia, no que
      // todas valgan igual.
      const conVariante = base({
        precioFijo: true,
        precioProducto: 50_000,
        precioVariante: 65_000,
      });
      expect(precioDeLinea(conVariante, { unitPrice: 65_000 })).toEqual({
        precio: 65_000,
      });
      expect(precioDeLinea(conVariante, { unitPrice: 50_000 }).error).toContain(
        'precio fijo',
      );
    });

    it('gana sobre el mínimo cuando los dos están puestos', () => {
      // Configuración contradictoria pero posible. El fijo es más estricto, así
      // que decide: si no, el mensaje de error hablaría del mínimo y nadie
      // entendería por qué no lo deja vender al precio de lista.
      const ambos = base({
        precioFijo: true,
        precioProducto: 50_000,
        precioMinimo: 40_000,
      });
      expect(precioDeLinea(ambos, { unitPrice: 45_000 }).error).toContain(
        'precio fijo',
      );
    });

    it('tolera el centavo de redondeo', () => {
      // El navegador manda 50000.00000001 y no se puede rechazar una venta por
      // eso.
      expect(precioDeLinea(fijo, { unitPrice: 50_000.0001 })).toEqual({
        precio: 50_000,
      });
    });
  });
});

/**
 * El precio único de la venta: la llave que abre el piso.
 *
 * «Si el precio que yo coloqué en vender todo al mismo precio es menor a ese
 * precio mínimo, que yo lo pueda vender sin problema». El caso es un negocio
 * cerrado —doscientos pares a 80.000— donde el dueño ya decidió a cuánto sale
 * la mercancía: el piso, que existe para que nadie rebaje por su cuenta, ahí
 * estorba.
 */
describe('precioDeLinea con precio único', () => {
  it('vende por debajo del piso cuando el renglón va con precio único', () => {
    expect(
      precioDeLinea(
        { precioProducto: 150_000, precioVariante: null, precioMinimo: 100_000, precioFijo: false },
        { unitPrice: 80_000, precioUnico: true },
      ),
    ).toEqual({ precio: 80_000 });
  });

  it('sin la marca, el piso sigue mandando', () => {
    // La llave no puede quedar abierta para cualquier edición suelta de
    // precio: eso dejaría el piso de adorno.
    const r = precioDeLinea(
      { precioProducto: 150_000, precioVariante: null, precioMinimo: 100_000, precioFijo: false },
      { unitPrice: 80_000 },
    );
    expect(r.error).toContain('100.000');
  });

  it('el precio fijo no cede ni con precio único', () => {
    // No es un piso, es un precio cerrado: «si tienen un precio, eso no tiene
    // descuento para nadie».
    const r = precioDeLinea(
      { precioProducto: 200_000, precioVariante: null, precioMinimo: null, precioFijo: true },
      { unitPrice: 80_000, precioUnico: true },
    );
    expect(r.error).toContain('precio fijo');
  });

  it('un precio negativo sigue siendo un error, con precio único o sin él', () => {
    expect(
      precioDeLinea(
        { precioProducto: 100_000, precioVariante: null, precioMinimo: null, precioFijo: false },
        { unitPrice: -1, precioUnico: true },
      ).error,
    ).toContain('negativo');
  });
});
