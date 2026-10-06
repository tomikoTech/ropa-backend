import {
  alcanzaParaElPedido,
  textoDelVeredicto,
} from './alcanza-para-el-pedido.js';

describe('si alcanza para el pedido del catálogo', () => {
  it('pedir más de lo que hay dice cuánto queda (el Vulcan de Andrea)', () => {
    const v = alcanzaParaElPedido([
      { nombre: 'VULCAN FEU', pedida: 6, existencias: 1, precio: 50000 },
    ]);
    expect(v.ok).toBe(false);
    expect(v.errores).toEqual(['VULCAN FEU: pediste 6 y solo queda 1']);
  });

  it('en plural cuando quedan varios', () => {
    const v = alcanzaParaElPedido([
      { nombre: 'LIGHT BLUE', pedida: 10, existencias: 4, precio: 30000 },
    ]);
    expect(v.errores).toEqual(['LIGHT BLUE: pediste 10 y solo quedan 4']);
  });

  it('sin existencias se dice agotado', () => {
    const v = alcanzaParaElPedido([
      { nombre: 'YARA', pedida: 1, existencias: 0, precio: 40000 },
    ]);
    expect(v.errores).toEqual(['YARA: se agotó']);
  });

  it('un producto sin precio no entra aunque haya existencias', () => {
    const v = alcanzaParaElPedido([
      { nombre: 'ESTUCHE YARA *4', pedida: 6, existencias: 33, precio: 0 },
    ]);
    expect(v.errores).toEqual(['ESTUCHE YARA *4: no tiene precio todavía']);
  });

  it('lo que cabe pasa, y los problemas salen todos juntos', () => {
    const v = alcanzaParaElPedido([
      { nombre: '212 NYC MEN', pedida: 10, existencias: 12, precio: 38000 },
      { nombre: 'VULCAN FEU', pedida: 6, existencias: 1, precio: 50000 },
      { nombre: 'ESTUCHE YARA *4', pedida: 6, existencias: 33, precio: 0 },
    ]);
    expect(v.ok).toBe(false);
    expect(v.errores).toHaveLength(2);
    expect(textoDelVeredicto(v)).toBe(
      'VULCAN FEU: pediste 6 y solo queda 1\nESTUCHE YARA *4: no tiene precio todavía',
    );
  });

  it('todo bien: ok sin errores', () => {
    expect(
      alcanzaParaElPedido([
        { nombre: 'A', pedida: 5, existencias: 5, precio: 1000 },
      ]),
    ).toEqual({ ok: true, errores: [] });
  });

  it('cantidades raras (negativas, decimales, texto) no tumban la regla', () => {
    expect(
      alcanzaParaElPedido([
        { nombre: 'A', pedida: -3, existencias: 2, precio: 1000 },
        {
          nombre: 'B',
          pedida: 2.4,
          existencias: '2' as unknown as number,
          precio: 1000,
        },
      ]).ok,
    ).toBe(true);
  });
});
