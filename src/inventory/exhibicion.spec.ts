import {
  ordenarParaDescuento,
  faltaPorExhibir,
  type FilaDeExistencia,
  type ConfiguracionExhibicion,
  type EstadoDeLaVitrina,
} from './exhibicion.js';

/**
 * La exhibición: el par que está en la vitrina.
 *
 * Nace de la falencia que un dueño de tres locales le encontró a la aplicación
 * que usa: «toda la exhibición, tanto cuando la voy a vender o la voy a
 * prestar, está como en otro inventario aparte… si yo voy a hacer una venta
 * múltiple de cuatro pares y una es la exhibición, primero tengo que reportar
 * los tres y después tengo que reportar la exhibición». En su sistema los
 * inventarios «no se combinan».
 *
 * Acá la vitrina es **una bodega más**, así que la cascada de la venta la toma
 * en el mismo ticket sin que nadie reporte nada aparte. Lo único que hay que
 * decidir es el **orden**: la muestra se toca de última, y cuando se va hay que
 * avisar que falta por exhibir.
 */

/** Las vitrinas se marcan por nombre para que cada caso se lea solo. */
const esVitrina = (warehouseId: string) => warehouseId.startsWith('vitrina');

const bodega = (
  warehouseId: string,
  quantity: number | string,
): FilaDeExistencia => ({ warehouseId, quantity });

const ids = (bs: FilaDeExistencia[]) => bs.map((b) => b.warehouseId);

const ordenar = (bs: FilaDeExistencia[], bodegaDeLaVenta: string) =>
  ordenarParaDescuento(bs, bodegaDeLaVenta, esVitrina);

describe('ordenarParaDescuento', () => {
  it('descuenta primero de la bodega donde se está cobrando', () => {
    // Es la regla que ya existía y que no se puede perder: el par que el
    // cliente tiene en la mano sale del local donde está parado.
    const orden = ordenar([bodega('bodega', 50), bodega('local', 2)], 'local');
    expect(ids(orden)).toEqual(['local', 'bodega']);
  });

  it('después, la que más tenga', () => {
    // Vaciar primero la que más tiene reparte el faltante entre menos sitios.
    const orden = ordenar(
      [bodega('b', 3), bodega('c', 9), bodega('a', 5)],
      'local-sin-existencia',
    );
    expect(ids(orden)).toEqual(['c', 'a', 'b']);
  });

  it('deja la vitrina de última, aunque tenga más que las demás', () => {
    // El corazón del asunto. Vender la muestra teniendo pares en la bodega
    // deja el local sin qué mostrar y obliga a un traslado que nadie pidió.
    const orden = ordenar(
      [bodega('vitrina', 20), bodega('bodega', 1)],
      'local',
    );
    expect(ids(orden)).toEqual(['bodega', 'vitrina']);
  });

  it('la vitrina va de última incluso si es donde se está cobrando', () => {
    // Un local puede tener su vitrina configurada como punto de venta. Que ahí
    // se cobre no convierte la muestra en la primera opción.
    const orden = ordenar(
      [bodega('vitrina', 5), bodega('bodega', 5)],
      'vitrina',
    );
    expect(ids(orden)).toEqual(['bodega', 'vitrina']);
  });

  it('si solo hay vitrina, se vende la muestra', () => {
    // No se le dice que no a un cliente por cuidar la exhibición: se vende y
    // queda el aviso de que falta por exhibir.
    const orden = ordenar([bodega('vitrina', 1)], 'local');
    expect(ids(orden)).toEqual(['vitrina']);
  });

  it('entre varias vitrinas manda la del local donde se cobra', () => {
    const orden = ordenar(
      [bodega('vitrina-otro', 9), bodega('vitrina-aqui', 1)],
      'vitrina-aqui',
    );
    expect(ids(orden)).toEqual(['vitrina-aqui', 'vitrina-otro']);
  });

  it('empata siempre igual: dos corridas eligen las mismas bodegas', () => {
    // Determinístico a propósito, como el ledger al elegir bultos por
    // antigüedad. Sin desempate, dos corridas con los mismos datos podían
    // descontar de bodegas distintas y volver irreproducible un descuadre.
    const entrada = [bodega('zeta', 4), bodega('alfa', 4), bodega('mid', 4)];
    const primera = ids(ordenar(entrada, 'ninguna'));
    const segunda = ids(ordenar([...entrada].reverse(), 'ninguna'));
    expect(primera).toEqual(segunda);
    expect(primera).toEqual(['alfa', 'mid', 'zeta']);
  });

  it('compara cantidades que llegan como texto, no como texto', () => {
    // `stock.quantity` es `decimal` y TypeORM lo entrega como cadena. Ordenar
    // alfabéticamente pondría «9» antes que «10», y la venta descontaría de la
    // bodega equivocada.
    const orden = ordenar(
      [bodega('nueve', '9'), bodega('diez', '10')],
      'ninguna',
    );
    expect(ids(orden)).toEqual(['diez', 'nueve']);
  });

  it('no modifica la lista que recibe', () => {
    // El llamador la sigue usando para leer los saldos originales.
    const entrada = [bodega('a', 1), bodega('b', 2)];
    ordenar(entrada, 'b');
    expect(ids(entrada)).toEqual(['a', 'b']);
  });

  it('con la lista vacía no revienta', () => {
    expect(ordenar([], 'local')).toEqual([]);
  });
});

const config = (
  extra: Partial<ConfiguracionExhibicion> = {},
): ConfiguracionExhibicion => ({ encendida: true, objetivo: 1, ...extra });

const vitrina = (
  extra: Partial<EstadoDeLaVitrina> = {},
): EstadoDeLaVitrina => ({
  enVitrina: 0,
  disponibleEnElLocal: 10,
  objetivoPropio: null,
  ...extra,
});

describe('faltaPorExhibir', () => {
  it('no avisa si la tienda no la encendió', () => {
    // Mismo criterio que el cierre de caja: nadie amanece con una pantalla
    // llena de pendientes que no pidió.
    expect(faltaPorExhibir(config({ encendida: false }), vitrina())).toBeNull();
  });

  it('avisa cuando la muestra se vendió y la vitrina quedó vacía', () => {
    // «Venden un zapato que está en exhibición, que es la muestra. Si lo
    // venden o lo prestan, ahí automáticamente ya sale la alerta».
    expect(faltaPorExhibir(config(), vitrina({ enVitrina: 0 }))).toEqual({
      cantidad: 1,
    });
  });

  it('no avisa si la muestra sigue en la vitrina', () => {
    expect(faltaPorExhibir(config(), vitrina({ enVitrina: 1 }))).toBeNull();
  });

  it('no avisa si hay más de lo que se pide exhibir', () => {
    // Sobrar no es faltar. Retirar lo que sobra lo decide la tienda.
    expect(faltaPorExhibir(config(), vitrina({ enVitrina: 3 }))).toBeNull();
  });

  it('no pide lo que el local no tiene', () => {
    // Un pendiente que nadie puede cumplir el vendedor lo lee como un error
    // suyo, y termina ignorando la lista entera.
    expect(
      faltaPorExhibir(config(), vitrina({ disponibleEnElLocal: 0 })),
    ).toBeNull();
  });

  it('pide solo hasta donde alcanza el local', () => {
    expect(
      faltaPorExhibir(
        config({ objetivo: 3 }),
        vitrina({ enVitrina: 0, disponibleEnElLocal: 2 }),
      ),
    ).toEqual({ cantidad: 2 });
  });

  it('un saldo negativo en la vitrina se cuenta como vacío', () => {
    // Existencia mal cuadrada de antes no es una deuda: exhibir dos pares por
    // un −1 viejo desabastece el local por un error que ya pasó.
    expect(
      faltaPorExhibir(config({ objetivo: 1 }), vitrina({ enVitrina: -2 })),
    ).toEqual({ cantidad: 1 });
  });

  it('el objetivo de la referencia manda sobre el general', () => {
    // Una referencia que se exhibe en dos colores pide dos, aunque la tienda
    // tenga puesto uno como norma.
    expect(
      faltaPorExhibir(
        config({ objetivo: 1 }),
        vitrina({ enVitrina: 0, objetivoPropio: 2 }),
      ),
    ).toEqual({ cantidad: 2 });
  });

  it('un objetivo propio en cero saca la referencia de la exhibición', () => {
    // Las cajas de cartón y los accesorios no se exhiben. Cero es una
    // decisión, no un valor sin poner: por eso `null` y `0` son distintos.
    expect(
      faltaPorExhibir(config({ objetivo: 1 }), vitrina({ objetivoPropio: 0 })),
    ).toBeNull();
  });

  it('un objetivo general en cero apaga el aviso para todo', () => {
    expect(faltaPorExhibir(config({ objetivo: 0 }), vitrina())).toBeNull();
  });

  it('un objetivo negativo se trata como cero, no como deuda', () => {
    expect(faltaPorExhibir(config({ objetivo: -1 }), vitrina())).toBeNull();
  });

  it('un disponible negativo tampoco alcanza para exhibir', () => {
    expect(
      faltaPorExhibir(config(), vitrina({ disponibleEnElLocal: -5 })),
    ).toBeNull();
  });
});
