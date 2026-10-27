import { sinBodegasPrivadas } from './bodega-privada.js';

const principal = { warehouseId: 'principal', quantity: 2 };
const locales = { warehouseId: 'locales', quantity: 40 };
const esPrivada = (id: string) => id === 'locales';

describe('bodega «solo nosotros»', () => {
  it('una venta en otra bodega no la toma, aunque allá no alcance', () => {
    expect(
      sinBodegasPrivadas([principal, locales], 'principal', esPrivada),
    ).toEqual([principal]);
  });

  it('vendiendo en ella, sí sale', () => {
    expect(
      sinBodegasPrivadas([principal, locales], 'locales', esPrivada),
    ).toEqual([principal, locales]);
  });

  it('la página web (sin bodega de venta privada) no la cuenta', () => {
    expect(sinBodegasPrivadas([locales], null, esPrivada)).toEqual([]);
  });

  it('sin bodegas privadas no cambia nada', () => {
    expect(
      sinBodegasPrivadas([principal, locales], 'principal', () => false),
    ).toHaveLength(2);
  });
});
