import { llevaUnidades } from './lleva-unidades.js';

/**
 * Si esta mercancía se etiqueta par por par.
 *
 * De esto depende que exista el código único que el cliente ve impreso en la
 * caja y que el vendedor escanea con la pistola. Sin él, dos líneas de la
 * misma referencia en una factura son indistinguibles — que es exactamente la
 * queja que destapó todo esto.
 *
 * Antes la regla era `producto OR tienda`, y tenía un agujero: **un producto
 * no podía decir que no**. Con el interruptor de la tienda encendido, una
 * esencia de perfumería que se mide en gramos habría recibido una etiqueta por
 * gramo: cargar cinco kilos habría creado cinco mil filas en una transacción.
 *
 * Por eso ahora son tres estados y el producto manda:
 *   - `true`  → se etiqueta, diga lo que diga la tienda
 *   - `false` → no se etiqueta, diga lo que diga la tienda
 *   - `null`  → lo que diga la tienda
 */
describe('llevaUnidades', () => {
  it('con la tienda encendida, lo normal es etiquetar', () => {
    // El caso por defecto desde ahora: toda tienda nueva nace encendida.
    expect(llevaUnidades(null, true)).toBe(true);
  });

  it('con la tienda apagada, no', () => {
    expect(llevaUnidades(null, false)).toBe(false);
  });

  it('un producto puede decir que no aunque la tienda diga que sí', () => {
    // La que importa: la esencia que se mide en gramos. Sin esto, encender el
    // interruptor de la tienda crea una etiqueta por gramo.
    expect(llevaUnidades(false, true)).toBe(false);
  });

  it('y puede decir que sí aunque la tienda diga que no', () => {
    // La tienda que solo etiqueta una línea de importación.
    expect(llevaUnidades(true, false)).toBe(true);
  });

  it('sin tienda configurada, no se etiqueta', () => {
    // Una tienda recién creada a la que todavía no se le escribieron los
    // ajustes: crear códigos que nadie pidió es peor que no crearlos.
    expect(llevaUnidades(null, null)).toBe(false);
    expect(llevaUnidades(null, undefined)).toBe(false);
  });

  it('pero el producto sigue mandando aunque no haya ajustes', () => {
    expect(llevaUnidades(true, null)).toBe(true);
    expect(llevaUnidades(false, null)).toBe(false);
  });
});
