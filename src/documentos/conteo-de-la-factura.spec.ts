import {
  contarLaFactura,
  textoDelConteo,
  totalesDeLaFactura,
  type RenglonContable,
} from './conteo-de-la-factura.js';

/**
 * Cuántos pares lleva la factura.
 *
 * «Me puedes ayudar a colocar el total de los pares, que un cliente me lo
 * pidió». Quien recibe la mercancía cuenta pares y bultos, no renglones.
 */

const par = (cantidad: number): RenglonContable => ({ cantidad });
const caja = (pares: number): RenglonContable => ({
  cantidad: pares,
  esCaja: true,
});

describe('contarLaFactura', () => {
  it('suma los pares de todos los renglones', () => {
    expect(contarLaFactura([par(2), par(3)]).unidades).toBe(5);
  });

  it('la caja suma sus pares al total, no «una»', () => {
    // El renglón de una caja guarda los pares que trae (24), que es lo que
    // salió del inventario. Contarla como 1 diría que se vendió un par.
    const c = contarLaFactura([caja(24), par(1)]);
    expect(c.unidades).toBe(25);
    expect(c.unidadesEnCajas).toBe(24);
  });

  it('y además dice cuántas cajas son: el que descarga cuenta bultos', () => {
    expect(contarLaFactura([caja(24), caja(12), par(3)]).cajas).toBe(2);
  });

  it('sin cajas, no hay cajas que contar', () => {
    expect(contarLaFactura([par(2)]).cajas).toBe(0);
  });

  it('una factura vacía cuenta cero, no revienta', () => {
    expect(contarLaFactura([])).toEqual({
      unidades: 0,
      cajas: 0,
      unidadesEnCajas: 0,
      productos: 0,
      items: 0,
    });
  });

  it('una cantidad rara no imprime «NaN pares» en la factura del cliente', () => {
    const c = contarLaFactura([
      par(2),
      { cantidad: Number.NaN },
      { cantidad: -3 },
    ]);
    expect(c.unidades).toBe(2);
  });
});

describe('textoDelConteo', () => {
  it('dice pares y cajas', () => {
    expect(textoDelConteo(contarLaFactura([caja(24), par(2)]), 'pares')).toBe(
      '26 pares · 1 caja',
    );
  });

  it('en plural cuando son varias cajas', () => {
    expect(textoDelConteo(contarLaFactura([caja(12), caja(12)]), 'pares')).toBe(
      '24 pares · 2 cajas',
    );
  });

  it('sin cajas, solo los pares', () => {
    expect(textoDelConteo(contarLaFactura([par(5)]), 'pares')).toBe('5 pares');
  });

  it('un solo par se dice en singular', () => {
    expect(textoDelConteo(contarLaFactura([par(1)]), 'pares')).toBe('1 par');
  });

  it('quien no vende calzado cuenta unidades', () => {
    // Distri Amber vende lociones: «3 pares de perfume» no lo dice nadie.
    expect(textoDelConteo(contarLaFactura([par(3)]), 'unidades')).toBe(
      '3 unidades',
    );
    expect(textoDelConteo(contarLaFactura([par(1)]), 'unidades')).toBe(
      '1 unidad',
    );
  });

  it('una factura sin renglones no imprime la línea', () => {
    expect(textoDelConteo(contarLaFactura([]), 'pares')).toBe('');
  });
});

/**
 * Los tres totales de arriba.
 *
 * «Pueden ser total productos, total cajas y luego total ítems, que haga la
 * suma de las cajas y los productos… total productos, solo productos, es
 * decir, los que no sean cajas».
 */
describe('totalesDeLaFactura', () => {
  it('separa lo suelto de las cajas y suma los ítems', () => {
    // Dos cajas (24 y 12 pares) más dos pares sueltos: el cliente recibe
    // cuatro cosas, y de esas dos son cajas.
    const t = totalesDeLaFactura(
      contarLaFactura([caja(24), caja(12), par(2)]),
      'pares',
    );
    expect(t).toEqual([
      { titulo: 'Total pares', valor: '2' },
      { titulo: 'Total cajas', valor: '2' },
      { titulo: 'Total ítems', valor: '4' },
    ]);
  });

  it('sin cajas no hay desglose que hacer: un solo recuadro', () => {
    expect(totalesDeLaFactura(contarLaFactura([par(5)]), 'pares')).toEqual([
      { titulo: 'Total pares', valor: '5' },
    ]);
  });

  it('quien no vende calzado cuenta productos', () => {
    expect(totalesDeLaFactura(contarLaFactura([par(3)]), 'unidades')).toEqual([
      { titulo: 'Total productos', valor: '3' },
    ]);
  });

  it('una factura de puras cajas dice cero sueltos, no esconde la fila', () => {
    // Que diga «0» es información: el cliente sabe que todo va empacado.
    const t = totalesDeLaFactura(contarLaFactura([caja(24)]), 'pares');
    expect(t.map((x) => x.valor)).toEqual(['0', '1', '1']);
  });

  it('una factura vacía no pinta recuadros', () => {
    expect(totalesDeLaFactura(contarLaFactura([]), 'pares')).toEqual([]);
  });
});
