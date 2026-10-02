import { comprobarReparto, repartoPropuesto } from './repartir-recibo.js';

const facturas = [
  { id: 'b', numero: 'F-2', fecha: '2026-09-10', saldo: 70_000 },
  { id: 'a', numero: 'F-1', fecha: '2026-08-01', saldo: 50_000 },
  { id: 'c', numero: 'F-3', fecha: '2026-09-20', saldo: 0 },
];

describe('repartoPropuesto', () => {
  it('va de la más vieja a la más nueva y para cuando se acaba el recibo', () => {
    expect(repartoPropuesto(facturas, 100_000)).toEqual([
      { id: 'a', monto: 50_000 },
      { id: 'b', monto: 50_000 },
    ]);
  });

  it('un recibo más grande que la deuda deja el resto sin repartir', () => {
    const r = repartoPropuesto(facturas, 500_000);
    expect(r.reduce((s, x) => s + x.monto, 0)).toBe(120_000);
  });

  it('los centavos no se pierden', () => {
    expect(
      repartoPropuesto(
        [{ id: 'a', numero: 'F', fecha: '2026-01-01', saldo: 0.3 }],
        0.1,
      ),
    ).toEqual([{ id: 'a', monto: 0.1 }]);
  });
});

describe('comprobarReparto', () => {
  it('acepta el reparto a mano cuando cuadra', () => {
    const r = comprobarReparto(facturas, 100_000, [
      { id: 'a', monto: 30_000 },
      { id: 'b', monto: 70_000 },
    ]);
    expect(r).toEqual({ ok: true, repartido: 100_000, sobra: 0 });
  });

  it('no deja abonar más de lo que debe una factura', () => {
    const r = comprobarReparto(facturas, 100_000, [
      { id: 'a', monto: 60_000 },
      { id: 'b', monto: 40_000 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('F-1');
  });

  it('el reparto tiene que sumar lo del recibo', () => {
    const r = comprobarReparto(facturas, 100_000, [{ id: 'a', monto: 50_000 }]);
    expect(r.ok).toBe(false);
    expect(r.sobra).toBe(50_000);
  });

  it('una factura ajena o repetida se rechaza', () => {
    expect(comprobarReparto(facturas, 10, [{ id: 'x', monto: 10 }]).ok).toBe(
      false,
    );
    expect(
      comprobarReparto(facturas, 20, [
        { id: 'a', monto: 10 },
        { id: 'a', monto: 10 },
      ]).motivo,
    ).toContain('dos veces');
  });
});
