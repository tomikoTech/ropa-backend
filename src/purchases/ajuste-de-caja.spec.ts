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

  // El bug de amawad: orden nueva vacía → cuenta en cero con isPaid=true
  // trivial, pero SIN pagos reales. Agregar la primera caja (0 → 4512) no se
  // puede bloquear: no hay dinero que proteger.
  it('cuenta en cero marcada pagada (isPaid) pero sin abonos: se permite agregar la primera caja', () => {
    expect(
      puedeReajustarPorCaja(
        { amount: 0, paidAmount: 0, isPaid: true },
        4512,
      ),
    ).toBe(true);
  });

  it('una baja con abonos reales sí se bloquea aunque isPaid sea false', () => {
    expect(
      puedeReajustarPorCaja(
        { amount: 100, paidAmount: 40, isPaid: false },
        80,
      ),
    ).toBe(false);
  });
});
