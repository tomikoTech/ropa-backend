import {
  decidirReposicion,
  type ConfiguracionReposicion,
  type EstadoDelPunto,
} from './reposicion-automatica.js';

/**
 * Cuándo el sistema pide reposición sin que nadie se lo diga.
 *
 * Es la queja más fuerte que dejó una tienda sobre su sistema anterior:
 * «siempre hay que notificar, reponer ese, reponer ese… solo debería ser
 * automático». Nuestra reposición existía pero exigía configurar un mínimo por
 * variante, que en la práctica nadie configuraba.
 *
 * La regla es corta y toda la gracia está en los bordes: no pedir dos veces lo
 * mismo, no pedir lo que ya viene en camino, y no pedirle a una bodega que
 * tampoco tiene.
 */

const config = (
  extra: Partial<ConfiguracionReposicion> = {},
): ConfiguracionReposicion => ({
  encendida: true,
  umbral: 1,
  objetivo: 3,
  soloEstosProductos: null,
  ...extra,
});

const punto = (extra: Partial<EstadoDelPunto> = {}): EstadoDelPunto => ({
  productId: 'p1',
  saldo: 0,
  yaPedido: 0,
  disponibleEnOrigen: 100,
  umbralPropio: null,
  ...extra,
});

describe('decidirReposicion', () => {
  it('no hace nada si la tienda no la encendió', () => {
    expect(decidirReposicion(config({ encendida: false }), punto())).toBeNull();
  });

  it('pide cuando el local se quedó sin la talla', () => {
    expect(decidirReposicion(config(), punto({ saldo: 0 }))).toEqual({
      cantidad: 3,
    });
  });

  it('pide también al tocar el umbral, no solo al llegar a cero', () => {
    // «Que cuando quede uno, pida»: el umbral es el último par, no el vacío.
    expect(
      decidirReposicion(config({ umbral: 1 }), punto({ saldo: 1 })),
    ).toEqual({ cantidad: 2 });
  });

  it('no pide mientras haya de sobra', () => {
    expect(
      decidirReposicion(config({ umbral: 1 }), punto({ saldo: 5 })),
    ).toBeNull();
  });

  it('no pide solo por estar debajo del objetivo: el que decide es el umbral', () => {
    // Con umbral 1 y objetivo 5, tener 3 en el local **no** dispara nada. El
    // objetivo dice hasta dónde reponer cuando toque; no cuándo toca. Sin esta
    // distinción, cada venta de una referencia bien surtida generaría una
    // solicitud y el bodeguero acabaría ignorándolas todas.
    expect(
      decidirReposicion(
        config({ umbral: 1, objetivo: 5 }),
        punto({ saldo: 3 }),
      ),
    ).toBeNull();
  });

  it('pide lo que falta para el objetivo, no el objetivo entero', () => {
    // Con dos en el local y objetivo cinco, se piden tres. Pedir cinco llenaría
    // el local de una talla que ya tiene.
    expect(
      decidirReposicion(
        config({ umbral: 2, objetivo: 5 }),
        punto({ saldo: 2 }),
      ),
    ).toEqual({ cantidad: 3 });
  });

  it('descuenta lo que ya viene en camino', () => {
    // Sin esto, cada venta genera otra solicitud y el bodeguero recibe cinco
    // pedidos del mismo zapato.
    expect(
      decidirReposicion(
        config({ objetivo: 3 }),
        punto({ saldo: 0, yaPedido: 3 }),
      ),
    ).toBeNull();
  });

  it('pide solo la diferencia cuando lo que viene no alcanza', () => {
    expect(
      decidirReposicion(
        config({ objetivo: 3 }),
        punto({ saldo: 0, yaPedido: 1 }),
      ),
    ).toEqual({ cantidad: 2 });
  });

  it('no pide más de lo que la bodega tiene', () => {
    // Pedir diez cuando en bodega hay dos genera una solicitud que nadie puede
    // cumplir, y el bodeguero la ve como un error suyo.
    expect(
      decidirReposicion(
        config({ objetivo: 10 }),
        punto({ disponibleEnOrigen: 2 }),
      ),
    ).toEqual({ cantidad: 2 });
  });

  it('no pide nada si la bodega tampoco tiene', () => {
    expect(
      decidirReposicion(config(), punto({ disponibleEnOrigen: 0 })),
    ).toBeNull();
  });

  it('el mínimo del producto manda sobre el de la tienda', () => {
    // Una referencia que rota muchísimo puede querer un umbral más alto que el
    // general. Con cuatro en el local y umbral propio cinco: se pide, y se
    // pide **uno** —lo que falta para llegar a cinco—, no lo que diría el
    // objetivo general.
    expect(
      decidirReposicion(
        config({ umbral: 1, objetivo: 3 }),
        punto({ saldo: 4, umbralPropio: 5 }),
      ),
    ).toEqual({ cantidad: 1 });
  });

  it('si el umbral propio es mayor que el objetivo, el objetivo sube con él', () => {
    // Configuración contradictoria: umbral 5 y objetivo 3. Reponer hasta 3
    // dejaría el local por debajo del umbral y pediría otra vez enseguida, en
    // un bucle.
    expect(
      decidirReposicion(
        config({ objetivo: 3 }),
        punto({ saldo: 0, umbralPropio: 5 }),
      ),
    ).toEqual({ cantidad: 5 });
  });

  it('respeta la lista de productos cuando la tienda la usa', () => {
    const soloUno = config({ soloEstosProductos: ['p9'] });
    expect(decidirReposicion(soloUno, punto({ productId: 'p1' }))).toBeNull();
    expect(decidirReposicion(soloUno, punto({ productId: 'p9' }))).toEqual({
      cantidad: 3,
    });
  });

  it('con la lista vacía no repone nada, que es lo que dice la lista', () => {
    // Distinto de `null`, que significa «todos». Una lista vacía es una
    // decisión: no hay productos elegidos.
    expect(
      decidirReposicion(config({ soloEstosProductos: [] }), punto()),
    ).toBeNull();
  });

  it('un saldo negativo se trata como cero, no como deuda', () => {
    // Pasa con existencia heredada mal cuadrada: pedir 3 − (−2) = 5 sería
    // reponer de más por un error de datos viejo.
    expect(
      decidirReposicion(config({ objetivo: 3 }), punto({ saldo: -2 })),
    ).toEqual({ cantidad: 3 });
  });
});
