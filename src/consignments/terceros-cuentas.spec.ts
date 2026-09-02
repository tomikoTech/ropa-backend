import {
  cuentasDeVenta,
  saldoDelLado,
  resumenPorMetodo,
  aCentavos,
} from './terceros-cuentas.js';

describe('cuentasDeVenta', () => {
  const venta = { salePrice: 50000, costPrice: 30000, quantity: 2 };

  it('sin abonos: debe todo de ambos lados', () => {
    const c = cuentasDeVenta(venta, []);
    expect(c.totalVentaCents).toBe(aCentavos(100000));
    expect(c.totalCostoCents).toBe(aCentavos(60000));
    expect(c.saldoClienteCents).toBe(aCentavos(100000));
    expect(c.saldoTerceroCents).toBe(aCentavos(60000));
    expect(c.clientPaid).toBe(false);
    expect(c.supplierPaid).toBe(false);
  });

  it('abono parcial del cliente: baja el saldo, sigue debiendo', () => {
    const c = cuentasDeVenta(venta, [
      { lado: 'CLIENT', amount: 40000, method: 'EFECTIVO' },
    ]);
    expect(c.cobradoClienteCents).toBe(aCentavos(40000));
    expect(c.saldoClienteCents).toBe(aCentavos(60000));
    expect(c.clientPaid).toBe(false);
  });

  it('abonos que completan: queda pagado', () => {
    const c = cuentasDeVenta(venta, [
      { lado: 'CLIENT', amount: 40000, method: 'EFECTIVO' },
      { lado: 'CLIENT', amount: 60000, method: 'TRANSFERENCIA' },
    ]);
    expect(c.saldoClienteCents).toBe(0);
    expect(c.clientPaid).toBe(true);
  });

  it('cobrar de más no deja saldo negativo y cuenta como pagado', () => {
    const c = cuentasDeVenta(venta, [
      { lado: 'CLIENT', amount: 120000, method: 'EFECTIVO' },
    ]);
    expect(c.saldoClienteCents).toBe(0);
    expect(c.clientPaid).toBe(true);
  });

  it('los dos lados son independientes', () => {
    const c = cuentasDeVenta(venta, [
      { lado: 'CLIENT', amount: 100000, method: 'EFECTIVO' },
      { lado: 'SUPPLIER', amount: 30000, method: 'EFECTIVO' },
    ]);
    expect(c.clientPaid).toBe(true);
    expect(c.saldoTerceroCents).toBe(aCentavos(30000));
    expect(c.supplierPaid).toBe(false);
  });
});

describe('saldoDelLado', () => {
  it('devuelve el saldo del lado pedido, en centavos', () => {
    const venta = { salePrice: 10000, costPrice: 6000, quantity: 1 };
    const abonos = [{ lado: 'CLIENT' as const, amount: 4000 }];
    expect(saldoDelLado(venta, abonos, 'CLIENT')).toBe(aCentavos(6000));
    expect(saldoDelLado(venta, abonos, 'SUPPLIER')).toBe(aCentavos(6000));
  });
});

describe('resumenPorMetodo', () => {
  it('agrupa lo cobrado por método y suma el crédito (lo que deben)', () => {
    const r = resumenPorMetodo([
      {
        venta: { salePrice: 100000, costPrice: 0, quantity: 1 },
        abonos: [{ lado: 'CLIENT', amount: 100000, method: 'EFECTIVO' }],
      },
      {
        venta: { salePrice: 80000, costPrice: 0, quantity: 1 },
        abonos: [{ lado: 'CLIENT', amount: 50000, method: 'TRANSFERENCIA' }],
      },
      {
        venta: { salePrice: 40000, costPrice: 0, quantity: 1 },
        abonos: [], // a crédito, sin abonar
      },
    ]);
    const efectivo = r.porMetodo.find((m) => m.metodo === 'EFECTIVO');
    const transf = r.porMetodo.find((m) => m.metodo === 'TRANSFERENCIA');
    expect(efectivo?.cobradoCents).toBe(aCentavos(100000));
    expect(transf?.cobradoCents).toBe(aCentavos(50000));
    expect(r.totalCobradoCents).toBe(aCentavos(150000));
    // Crédito = 40000 (nada abonado) + 30000 (saldo de la de transferencia).
    expect(r.creditoCents).toBe(aCentavos(70000));
  });

  it('los abonos del tercero (SUPPLIER) no cuentan como cobro al cliente', () => {
    const r = resumenPorMetodo([
      {
        venta: { salePrice: 10000, costPrice: 6000, quantity: 1 },
        abonos: [{ lado: 'SUPPLIER', amount: 6000, method: 'EFECTIVO' }],
      },
    ]);
    expect(r.totalCobradoCents).toBe(0);
    expect(r.creditoCents).toBe(aCentavos(10000));
  });
});
