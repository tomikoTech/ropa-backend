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
