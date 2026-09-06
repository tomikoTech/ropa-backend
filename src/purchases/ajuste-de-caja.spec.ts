import { puedeReajustarPorCaja } from './ajuste-de-caja.js';

describe('puedeReajustarPorCaja', () => {
  it('sin cuenta por pagar, siempre se puede', () => {
    expect(puedeReajustarPorCaja(null, 999)).toBe(true);
  });

  it('si el total no cambia, se puede aunque haya pagos', () => {
    expect(
      puedeReajustarPorCaja(
        { amount: 100, paidAmount: 100, isPaid: true },
        100,
      ),
    ).toBe(true);
  });

  it('sin pagos, se puede subir y bajar', () => {
    const cuenta = { amount: 100, paidAmount: 0, isPaid: false };
    expect(puedeReajustarPorCaja(cuenta, 150)).toBe(true);
    expect(puedeReajustarPorCaja(cuenta, 50)).toBe(true);
  });

  it('con pagos, un AUMENTO se permite (agregar una caja)', () => {
    // Es el caso de amawad: cuenta con abono, se agrega una caja → sube.
    expect(
      puedeReajustarPorCaja(
        { amount: 100, paidAmount: 40, isPaid: false },
        148,
      ),
    ).toBe(true);
  });

  it('con pagos, una BAJA se bloquea', () => {
    expect(
      puedeReajustarPorCaja(
        { amount: 100, paidAmount: 40, isPaid: false },
        80,
      ),
    ).toBe(false);
  });

  it('pagada por completo, subir se permite (queda debiendo la diferencia)', () => {
    expect(
      puedeReajustarPorCaja(
        { amount: 100, paidAmount: 100, isPaid: true },
        130,
      ),
    ).toBe(true);
  });
});
