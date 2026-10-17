import { soloConSaldo, totalesDelEstado } from './estado-de-cuenta.js';

const pagada = { total: 100_000, paidAmount: 100_000, balance: 0 };
const parcial = { total: 200_000, paidAmount: 50_000, balance: 150_000 };
const pendiente = { total: 80_000, paidAmount: 0, balance: 80_000 };

describe('estado de cuenta: solo lo que debe', () => {
  it('deja fuera las facturas pagadas y conserva parciales y pendientes', () => {
    expect(soloConSaldo([pagada, parcial, pendiente])).toEqual([
      parcial,
      pendiente,
    ]);
  });

  it('un saldo de centavos por redondeo no es deuda', () => {
    expect(soloConSaldo([{ ...pagada, balance: 0.2 }])).toEqual([]);
  });

  it('los totales son de las facturas que quedan, no de toda la historia', () => {
    expect(
      totalesDelEstado(soloConSaldo([pagada, parcial, pendiente])),
    ).toEqual({
      totalCredit: 280_000,
      totalPaid: 50_000,
      totalDebt: 230_000,
    });
  });

  it('la deuda es la misma con o sin las pagadas', () => {
    const todas = [pagada, parcial, pendiente];
    expect(totalesDelEstado(todas).totalDebt).toBe(
      totalesDelEstado(soloConSaldo(todas)).totalDebt,
    );
  });

  it('un cliente al día queda sin facturas y en cero', () => {
    expect(totalesDelEstado(soloConSaldo([pagada]))).toEqual({
      totalCredit: 0,
      totalPaid: 0,
      totalDebt: 0,
    });
  });
});
