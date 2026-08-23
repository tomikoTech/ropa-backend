import {
  bodegasDelMostrador,
  ordenarParaDescuento,
  faltaPorExhibir,
  repartirVitrinaYBodega,
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

/**
 * Qué se ve desde el mostrador.
 *
 * «Que me ponga la exhibición ahí como en otro colorcito.» Para poder pintarla
 * distinta hay primero que traerla: el catálogo del POS filtraba por la bodega
 * donde se cobra, así que los pares de la vitrina no llegaban a la pantalla —
 * aunque la venta sí puede tomarlos, porque la cascada recorre todas las
 * bodegas de la tienda—. El vendedor veía «3 disponibles» donde había 4.
 */
describe('bodegasDelMostrador', () => {
  const local = { id: 'local', exhibitionOfWarehouseId: null };
  const vitrina = { id: 'vitrina', exhibitionOfWarehouseId: 'local' };
  const otraVitrina = { id: 'aparador', exhibitionOfWarehouseId: 'local' };
  const ajena = { id: 'vitrina-2', exhibitionOfWarehouseId: 'otro-local' };
  const bodegaCentral = { id: 'central', exhibitionOfWarehouseId: null };

  it('sin vitrinas, el mostrador ve solo lo suyo', () => {
    expect(bodegasDelMostrador('local', [local, bodegaCentral])).toEqual([
      'local',
    ]);
  });

  it('el local ve su vitrina, y el local va primero', () => {
    // Primero lo suyo: es donde se busca el par cuando el cliente pregunta.
    expect(bodegasDelMostrador('local', [local, vitrina])).toEqual([
      'local',
      'vitrina',
    ]);
  });

  it('ve todas sus vitrinas, siempre en el mismo orden', () => {
    // Determinístico: una lista que se reordena sola al recargar hace dudar de
    // los números que trae al lado.
    expect(bodegasDelMostrador('local', [local, vitrina, otraVitrina])).toEqual(
      ['local', 'aparador', 'vitrina'],
    );
  });

  it('la vitrina de otro local no se cuela', () => {
    // Sería mostrar como disponible un par que está en otra ciudad.
    expect(bodegasDelMostrador('local', [local, vitrina, ajena])).toEqual([
      'local',
      'vitrina',
    ]);
  });

  it('si se cobra en la vitrina, no arrastra la bodega que la surte', () => {
    // La vitrina no se surte a sí misma, y hacia arriba tampoco mira: lo que
    // hay en la bodega no está en el mostrador donde está parado el cliente.
    expect(bodegasDelMostrador('vitrina', [local, vitrina])).toEqual([
      'vitrina',
    ]);
  });

  it('una vitrina mal configurada sobre sí misma no se cuenta dos veces', () => {
    // Hoy `validarVitrina()` no deja crear una vitrina que se surta a sí
    // misma, pero hay datos anteriores a esa validación. Si el id se repitiera
    // en la lista, el catálogo consultaría esa bodega dos veces y el POS
    // mostraría el doble de pares de los que hay.
    const rota = { id: 'local', exhibitionOfWarehouseId: 'local' };
    expect(bodegasDelMostrador('local', [rota])).toEqual(['local']);
  });

  it('una bodega que no está en la lista sigue viéndose a sí misma', () => {
    // Devolver una lista vacía dejaría el POS sin catálogo por un dato
    // desactualizado.
    expect(bodegasDelMostrador('recien-creada', [local, vitrina])).toEqual([
      'recien-creada',
    ]);
  });
});

describe('repartirVitrinaYBodega', () => {
  const esVitrina = (id: string) => id === 'vitrina';

  it('separa lo que está en la muestra de lo que hay para vender', () => {
    // El número que decide: «hay 4, pero 1 es la muestra».
    expect(
      repartirVitrinaYBodega(
        [
          { warehouseId: 'local', quantity: 3 },
          { warehouseId: 'vitrina', quantity: 1 },
        ],
        esVitrina,
      ),
    ).toEqual({ enBodega: 3, enVitrina: 1 });
  });

  it('cuenta como texto lo que Postgres manda como texto', () => {
    expect(
      repartirVitrinaYBodega(
        [{ warehouseId: 'vitrina', quantity: '2' }],
        esVitrina,
      ),
    ).toEqual({ enBodega: 0, enVitrina: 2 });
  });

  it('un saldo negativo no resta de la muestra', () => {
    // Un descuadre no puede hacer que la vitrina parezca tener de menos.
    expect(
      repartirVitrinaYBodega(
        [
          { warehouseId: 'local', quantity: -2 },
          { warehouseId: 'vitrina', quantity: 1 },
        ],
        esVitrina,
      ),
    ).toEqual({ enBodega: 0, enVitrina: 1 });
  });

  it('sin existencias, dos ceros', () => {
    expect(repartirVitrinaYBodega([], esVitrina)).toEqual({
      enBodega: 0,
      enVitrina: 0,
    });
  });
});
