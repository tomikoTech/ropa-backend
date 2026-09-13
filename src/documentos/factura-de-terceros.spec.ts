import {
  facturaDeTerceros,
  nombreDelArchivo,
  numeroDelComprobante,
  type FilaDeTercero,
} from './factura-de-terceros.js';

const fila = (extra: Partial<FilaDeTercero> = {}): FilaDeTercero => ({
  id: 'a1',
  thirdPartyName: 'Don José',
  productDescription: 'Nike Air Force 1',
  size: '40',
  color: 'Blanco',
  quantity: 1,
  salePrice: 150000,
  costPrice: 95000,
  clientName: 'Marcela',
  saleDate: '2026-09-13T15:00:00.000Z',
  ...extra,
});

describe('facturaDeTerceros', () => {
  it('suma los renglones y el total es el subtotal: sin descuento ni IVA', () => {
    const f = facturaDeTerceros(
      [fila(), fila({ id: 'b2', productDescription: 'Crocs', quantity: 2, salePrice: 98000 })],
      new Map(),
    );
    expect(f.renglones).toHaveLength(2);
    expect(f.renglones[1]).toMatchObject({ nombre: 'Crocs', cantidad: 2, total: 196000 });
    expect(f.subtotal).toBe(346000);
    expect(f.total).toBe(346000);
    expect(f.descuento).toBe(0);
    expect(f.iva).toBe(0);
  });

  it('lo pagado sale de los abonos del cliente y el saldo es lo que falta', () => {
    const f = facturaDeTerceros(
      [fila({ id: 'a1' }), fila({ id: 'b2', salePrice: 50000 })],
      new Map([
        ['a1', [{ lado: 'CLIENT', amount: 100000 }]],
        // Lo que se le pagó al tercero no es plata del cliente.
        ['b2', [{ lado: 'SUPPLIER', amount: 50000 }]],
      ]),
    );
    expect(f.total).toBe(200000);
    expect(f.pagado).toBe(100000);
    expect(f.saldo).toBe(100000);
  });

  it('una fila marcada como pagada sin abonos cuenta como cobrada', () => {
    const f = facturaDeTerceros([fila({ clientPaid: true })], new Map());
    expect(f.pagado).toBe(150000);
    expect(f.saldo).toBe(0);
  });

  it('un abono de más no imprime saldo a favor', () => {
    const f = facturaDeTerceros(
      [fila()],
      new Map([['a1', [{ lado: 'CLIENT', amount: 999999 }]]]),
    );
    expect(f.pagado).toBe(150000);
    expect(f.saldo).toBe(0);
  });

  it('sin nombre de cliente es consumidor final; la talla y el color van en el detalle', () => {
    const f = facturaDeTerceros([fila({ clientName: '  ' })], new Map());
    expect(f.cliente).toBe('Consumidor final');
    expect(f.renglones[0].detalle).toBe('40 / Blanco');
    expect(facturaDeTerceros([fila({ size: '', color: '' })], new Map()).renglones[0].detalle).toBeNull();
  });

  it('sin renglones no hay factura', () => {
    expect(() => facturaDeTerceros([], new Map())).toThrow();
  });
});

describe('numeroDelComprobante y nombreDelArchivo', () => {
  it('el mismo grupo da el mismo número aunque lleguen en otro orden', () => {
    expect(numeroDelComprobante(['a', 'b'])).toBe(numeroDelComprobante(['b', 'a']));
    expect(numeroDelComprobante(['a', 'b'])).toMatch(/^VT-[0-9A-F]{8}$/);
  });

  it('dos grupos distintos dan números distintos', () => {
    expect(numeroDelComprobante(['a'])).not.toBe(numeroDelComprobante(['a', 'b']));
  });

  it('una sola fila se guarda con su id; varias, con un resumen que no depende del orden', () => {
    expect(nombreDelArchivo(['a1'])).toBe('terceros/a1.pdf');
    expect(nombreDelArchivo(['a', 'b'])).toBe(nombreDelArchivo(['b', 'a']));
    expect(nombreDelArchivo(['a', 'b'])).not.toBe(nombreDelArchivo(['a']));
    // Repetir un id no cambia el grupo.
    expect(nombreDelArchivo(['a', 'a'])).toBe('terceros/a.pdf');
  });
});
