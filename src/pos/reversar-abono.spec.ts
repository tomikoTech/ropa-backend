import { reversarAbono, type AbonoParaReversar } from './reversar-abono.js';

const abono = (
  id: string,
  centavos: number,
  reversaA: string | null = null,
): AbonoParaReversar => ({ id, centavos, reversaA });

describe('reversarAbono', () => {
  it('reversa un abono dejando su contrapartida en negativo', () => {
    const r = reversarAbono({
      abonos: [abono('a', 34_500_000)],
      abonoId: 'a',
    });
    expect(r).toEqual({
      ok: true,
      centavosDelContra: -34_500_000,
      abonadoQueQueda: 0,
    });
  });

  it('con varios abonos solo descuenta el que se reversa', () => {
    const r = reversarAbono({
      abonos: [abono('a', 10_000_00), abono('b', 5_000_00)],
      abonoId: 'b',
    });
    expect(r).toEqual({
      ok: true,
      centavosDelContra: -5_000_00,
      abonadoQueQueda: 10_000_00,
    });
  });

  it('un abono que no existe se rechaza con su motivo', () => {
    const r = reversarAbono({ abonos: [abono('a', 100)], abonoId: 'fantasma' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/no existe/i);
  });

  it('no se reversa dos veces', () => {
    // La segunda pulsación del mismo botón: sin esto la cuenta quedaría con
    // el abonado en menos de lo que se cobró.
    const r = reversarAbono({
      abonos: [abono('a', 5_000_00), abono('c', -5_000_00, 'a')],
      abonoId: 'a',
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/ya fue reversado/i);
  });

  it('un contra-abono no se puede reversar', () => {
    const r = reversarAbono({
      abonos: [abono('a', 5_000_00), abono('c', -5_000_00, 'a')],
      abonoId: 'c',
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/ya es una reversa/i);
  });

  it('tampoco se reversa un renglón negativo sin marca de reversa', () => {
    // Datos viejos o importados: el signo alcanza para reconocerlo.
    const r = reversarAbono({ abonos: [abono('x', -1_000_00)], abonoId: 'x' });
    expect(r.ok).toBe(false);
  });

  it('el abonado que queda nunca baja de cero', () => {
    // No debería pasar —el contra ya está contado—, pero un dato torcido no
    // puede dejar la cuenta como si el cliente tuviera saldo a favor.
    const r = reversarAbono({
      abonos: [abono('a', 5_000_00), abono('viejo', -9_000_00, 'otro')],
      abonoId: 'a',
    });
    expect(r.ok && r.abonadoQueQueda).toBe(0);
  });

  it('trabaja en centavos enteros: no aparecen decimales', () => {
    const r = reversarAbono({ abonos: [abono('a', 33_333_33)], abonoId: 'a' });
    expect(r.ok && Number.isInteger(r.centavosDelContra)).toBe(true);
    expect(r.ok && r.centavosDelContra).toBe(-33_333_33);
  });
});
