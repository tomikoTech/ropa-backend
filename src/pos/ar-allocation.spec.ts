import { repartirAbono, type CuentaPorCobrar } from './ar-allocation.js';

/**
 * Repartir un abono entre varias deudas.
 *
 * Un local le debe diez pares de días distintos. Antes había que cobrarlos uno
 * por uno —«a veces se demoraba mucho»—; ahora se juntan y se cobra una vez.
 * El reparto es de la más vieja a la más nueva, que es como se cobra en la
 * calle y como lo espera quien debe.
 *
 * Todo en **centavos enteros**: con decimales, tres abonos de un tercio dejan
 * un peso colgando y la deuda nunca cierra.
 */

const cuenta = (id: string, total: number, pagado = 0): CuentaPorCobrar => ({
  id,
  totalCents: total,
  paidCents: pagado,
});

describe('repartirAbono', () => {
  it('salda la primera y deja la segunda intacta cuando alcanza justo', () => {
    const r = repartirAbono([cuenta('a', 10_000), cuenta('b', 5_000)], 10_000);
    expect(r).toEqual([
      { cuentaId: 'a', centavos: 10_000, quedaSaldada: true },
    ]);
  });

  it('va de la más vieja a la más nueva, en el orden que se le den', () => {
    const r = repartirAbono(
      [cuenta('vieja', 3_000), cuenta('nueva', 3_000)],
      4_000,
    );
    expect(r).toEqual([
      { cuentaId: 'vieja', centavos: 3_000, quedaSaldada: true },
      { cuentaId: 'nueva', centavos: 1_000, quedaSaldada: false },
    ]);
  });

  it('respeta lo que ya estaba abonado', () => {
    // Debía 10.000 y ya había abonado 7.000: solo quedan 3.000 por cobrar.
    const r = repartirAbono([cuenta('a', 10_000, 7_000)], 3_000);
    expect(r).toEqual([{ cuentaId: 'a', centavos: 3_000, quedaSaldada: true }]);
  });

  it('se salta las que ya están saldadas en vez de crearles un abono de cero', () => {
    const r = repartirAbono(
      [cuenta('saldada', 5_000, 5_000), cuenta('viva', 2_000)],
      2_000,
    );
    expect(r).toEqual([
      { cuentaId: 'viva', centavos: 2_000, quedaSaldada: true },
    ]);
  });

  it('no reparte más de lo que hay: sobra lo que sobra', () => {
    // Quien llama tiene que rechazar el exceso ANTES; esta función no inventa
    // deuda para acomodar la plata.
    const r = repartirAbono([cuenta('a', 1_000)], 5_000);
    expect(r).toEqual([{ cuentaId: 'a', centavos: 1_000, quedaSaldada: true }]);
  });

  it('un abono de cero no toca nada', () => {
    expect(repartirAbono([cuenta('a', 1_000)], 0)).toEqual([]);
  });

  it('un abono negativo tampoco: no se cobra al revés', () => {
    expect(repartirAbono([cuenta('a', 1_000)], -500)).toEqual([]);
  });

  it('sin cuentas, no hay nada que repartir', () => {
    expect(repartirAbono([], 10_000)).toEqual([]);
  });

  it('el peso que no se puede partir en tres no se pierde', () => {
    // 100 centavos entre tres deudas de 34, 33 y 33: se aplica en orden y
    // cierra exacto. Con decimales quedaría 0,33 tres veces y sobraría 0,01.
    const r = repartirAbono(
      [cuenta('a', 34), cuenta('b', 33), cuenta('c', 33)],
      100,
    );
    expect(r.reduce((n, x) => n + x.centavos, 0)).toBe(100);
    expect(r.every((x) => x.quedaSaldada)).toBe(true);
  });

  it('recorta el sobrante y cierra la cuenta con el último centavo', () => {
    // Pagado 999 de 1.000 y llega un abono de 2: se aplica **1**, no 2, y la
    // cuenta queda saldada. Sin el recorte quedaría pagada de más y con saldo
    // negativo; sin el cierre quedaría «casi saldada» para siempre.
    const r = repartirAbono([cuenta('a', 1_000, 999)], 2);
    expect(r).toEqual([{ cuentaId: 'a', centavos: 1, quedaSaldada: true }]);
  });

  it('una cuenta con más abonado que total no genera un abono negativo', () => {
    // Dato torcido heredado: se ignora en vez de restar plata.
    const r = repartirAbono(
      [cuenta('rara', 1_000, 1_500), cuenta('b', 500)],
      500,
    );
    expect(r).toEqual([{ cuentaId: 'b', centavos: 500, quedaSaldada: true }]);
  });
});
