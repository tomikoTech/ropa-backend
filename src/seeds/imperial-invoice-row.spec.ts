import {
  IMPERIAL_FACTURAS_HEADERS,
  IMPERIAL_INVOICE_699_2,
  parseImperialInvoiceCorrection,
} from './imperial-invoice-row.js';

describe('Imperial invoice correction mapping', () => {
  it('maps invoice 699-2 to the same 15 columns as the spreadsheet', () => {
    expect(IMPERIAL_FACTURAS_HEADERS).toHaveLength(15);
    expect(IMPERIAL_INVOICE_699_2).toEqual({
      fact: '699-2',
      fecha: '2026-07-24',
      vence: '2026-08-23',
      diasCredito: 30,
      nombre: 'Dalila Peñaloza',
      valor: 615000,
      descuento: 0,
      total: 615000,
      abonos: 0,
      saldo: 615000,
      bucket30a60: 0,
      bucket61a90: 0,
      bucketMas90: 0,
      totalDias: -15,
      pendiente: 'DEBE',
    });
  });

  it('rejects a row whose total, payments and balance do not reconcile', () => {
    expect(() =>
      parseImperialInvoiceCorrection(
        '699-2,24/07/2026,23/08/2026,30,Dalila Peñaloza,615000,615000,1,615000,0,0,0,-15,DEBE',
      ),
    ).toThrow('Total, abonos y saldo no cuadran');
  });
});
