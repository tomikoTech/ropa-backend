import {
  cuadrarDia,
  cuadrarEfectivo,
  descuadresDelDesglose,
  diaLocal,
  rangoUtcDelDia,
  type MovimientoDeCaja,
} from './cuadre.js';

/**
 * Cuadrar el día.
 *
 * «Yo al final del día entro a transferencias, entro a la foto, corroboro que
 * haya entrado esa plata, a esa hora y a qué cuenta». Eso es lo que arma este
 * archivo: cuánto entró en efectivo y cuánto por transferencia, separado por
 * local y por vendedor, porque en un mismo local factura más de una persona.
 *
 * Todo en **centavos enteros**: con decimales, un total de pantalla y un total
 * de base de datos que difieren en un peso mandan a alguien a contar billetes
 * dos veces.
 */

const mov = (over: Partial<MovimientoDeCaja> = {}): MovimientoDeCaja => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  origen: 'VENTA',
  metodo: 'EFECTIVO',
  centavos: 10_000,
  localId: 'local-1',
  localNombre: 'Centro',
  usuarioId: 'ana',
  usuarioNombre: 'Ana',
  bancoId: null,
  bancoNombre: null,
  comprobanteUrl: null,
  referencia: null,
  documento: 'V-001',
  registradoEn: new Date('2026-08-22T15:00:00.000Z'),
  anulado: false,
  ...over,
});

describe('cuadrarDia', () => {
  it('un día sin ventas da ceros, no vacíos ni NaN', () => {
    // El primer día de una tienda nueva, y el lunes festivo de todas las demás.
    // Si esto devolviera listas sin totales, la pantalla mostraría "$NaN".
    const c = cuadrarDia([]);
    expect(c.totales.totalCents).toBe(0);
    expect(c.totales.efectivoCents).toBe(0);
    expect(c.totales.transferenciaCents).toBe(0);
    expect(c.porLocal).toEqual([]);
    expect(c.porUsuario).toEqual([]);
    expect(c.sinComprobante).toEqual([]);
    expect(c.anulados).toEqual([]);
  });

  it('separa efectivo de transferencia', () => {
    const c = cuadrarDia([
      mov({ metodo: 'EFECTIVO', centavos: 50_000 }),
      mov({
        metodo: 'TRANSFERENCIA',
        centavos: 30_000,
        comprobanteUrl: 'r.jpg',
      }),
    ]);
    expect(c.totales.efectivoCents).toBe(50_000);
    expect(c.totales.transferenciaCents).toBe(30_000);
    expect(c.totales.totalCents).toBe(80_000);
  });

  it('la tarjeta no se cuenta como efectivo ni como transferencia', () => {
    // Datáfono: entra al banco, pero no es la transferencia que se corrobora
    // con foto. Mezclarlo con efectivo descuadraría el conteo del cajón.
    const c = cuadrarDia([mov({ metodo: 'TARJETA', centavos: 20_000 })]);
    expect(c.totales.efectivoCents).toBe(0);
    expect(c.totales.transferenciaCents).toBe(0);
    expect(c.totales.tarjetaCents).toBe(20_000);
    expect(c.totales.totalCents).toBe(20_000);
  });

  it('una venta anulada no suma, pero queda a la vista', () => {
    // Que desaparezca es peor: quien la hizo la busca y no la encuentra, y
    // termina pensando que el sistema perdió una venta.
    const c = cuadrarDia([
      mov({ id: 'viva', centavos: 10_000 }),
      mov({ id: 'muerta', centavos: 99_000, anulado: true }),
    ]);
    expect(c.totales.totalCents).toBe(10_000);
    expect(c.anulados.map((m) => m.id)).toEqual(['muerta']);
    expect(c.porLocal[0].totales.totalCents).toBe(10_000);
  });

  it('un pago mixto en una misma venta suma a los dos métodos', () => {
    // El cliente paga 30.000 en efectivo y transfiere los otros 20.000: son
    // dos filas de pago de la MISMA factura. El total de la venta es uno solo.
    const c = cuadrarDia([
      mov({ documento: 'V-007', metodo: 'EFECTIVO', centavos: 30_000 }),
      mov({
        documento: 'V-007',
        metodo: 'TRANSFERENCIA',
        centavos: 20_000,
        comprobanteUrl: 'r.jpg',
      }),
    ]);
    expect(c.totales.efectivoCents).toBe(30_000);
    expect(c.totales.transferenciaCents).toBe(20_000);
    expect(c.totales.totalCents).toBe(50_000);
    expect(c.porLocal[0].totales.totalCents).toBe(50_000);
  });

  it('los abonos de cartera del día entran al cuadre y se distinguen de las ventas', () => {
    // A un local le entra plata por las dos vías. Un cuadre que solo mire
    // `payments` deja por fuera lo que se cobró de lo fiado.
    const c = cuadrarDia([
      mov({ origen: 'VENTA', centavos: 10_000 }),
      mov({ origen: 'ABONO', centavos: 7_000, documento: 'Abono V-003' }),
    ]);
    expect(c.totales.ventasCents).toBe(10_000);
    expect(c.totales.abonosCents).toBe(7_000);
    expect(c.totales.totalCents).toBe(17_000);
  });

  it('dos vendedores en el mismo local: el local suma los dos y cada uno responde por lo suyo', () => {
    const c = cuadrarDia([
      mov({ usuarioId: 'ana', usuarioNombre: 'Ana', centavos: 10_000 }),
      mov({ usuarioId: 'beto', usuarioNombre: 'Beto', centavos: 25_000 }),
    ]);
    expect(c.porLocal).toHaveLength(1);
    expect(c.porLocal[0].totales.totalCents).toBe(35_000);
    expect(
      c.porLocal[0].porUsuario.map((u) => [u.nombre, u.totales.totalCents]),
    ).toEqual([
      ['Ana', 10_000],
      ['Beto', 25_000],
    ]);
  });

  it('el mismo vendedor en dos locales queda separado por local', () => {
    // Ana cubre el otro local el sábado. Su plata no puede aparecer toda en
    // uno solo: cada local cuadra su propio cajón.
    const c = cuadrarDia([
      mov({ localId: 'l1', localNombre: 'Centro', centavos: 10_000 }),
      mov({ localId: 'l2', localNombre: 'Norte', centavos: 4_000 }),
    ]);
    expect(c.porLocal.map((l) => [l.nombre, l.totales.totalCents])).toEqual([
      ['Centro', 10_000],
      ['Norte', 4_000],
    ]);
    // Visto por vendedor, en cambio, es una sola persona con 14.000.
    expect(c.porUsuario).toHaveLength(1);
    expect(c.porUsuario[0].totales.totalCents).toBe(14_000);
  });

  it('los grupos salen en orden alfabético, no en el que vino la consulta', () => {
    const c = cuadrarDia([
      mov({ localId: 'l2', localNombre: 'Norte' }),
      mov({ localId: 'l1', localNombre: 'Centro' }),
    ]);
    expect(c.porLocal.map((l) => l.nombre)).toEqual(['Centro', 'Norte']);
  });

  it('señala las transferencias sin comprobante: son las que hay que ir a buscar', () => {
    const c = cuadrarDia([
      mov({ id: 'con', metodo: 'TRANSFERENCIA', comprobanteUrl: 'r.jpg' }),
      mov({ id: 'sin', metodo: 'TRANSFERENCIA', comprobanteUrl: null }),
      mov({ id: 'efectivo', metodo: 'EFECTIVO', comprobanteUrl: null }),
    ]);
    // El efectivo no lleva foto: pedírsela sería ruido.
    expect(c.sinComprobante.map((m) => m.id)).toEqual(['sin']);
  });

  it('una transferencia anulada no se reclama por comprobante', () => {
    // Perseguir la foto de una venta que ya no existe es mandar a alguien a
    // buscar algo que nadie necesita.
    const c = cuadrarDia([
      mov({
        id: 'sin',
        metodo: 'TRANSFERENCIA',
        comprobanteUrl: null,
        anulado: true,
      }),
    ]);
    expect(c.sinComprobante).toEqual([]);
  });

  it('un comprobante en blanco cuenta como que no hay', () => {
    // La columna es texto: '' y '   ' llegan de datos viejos y de un formulario
    // que se envió sin subir nada.
    const c = cuadrarDia([
      mov({ id: 'a', metodo: 'TRANSFERENCIA', comprobanteUrl: '' }),
      mov({ id: 'b', metodo: 'TRANSFERENCIA', comprobanteUrl: '   ' }),
    ]);
    expect(c.sinComprobante.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('los métodos raros no se pierden: caen en "otros" y siguen sumando al total', () => {
    // `MIXTO` como fila suelta es dato heredado. Descartarlo haría que el
    // cuadre no cuadre y nadie sabría por qué faltan 5.000.
    const c = cuadrarDia([mov({ metodo: 'MIXTO', centavos: 5_000 })]);
    expect(c.totales.otrosCents).toBe(5_000);
    expect(c.totales.totalCents).toBe(5_000);
  });

  it('cada grupo dice cuántos movimientos lo componen', () => {
    // La pantalla muestra "Ana · 3 movimientos" sin volver a contar filas, y
    // con ese número se sabe si faltó registrar algo antes de contar el cajón.
    const c = cuadrarDia([
      mov({ usuarioId: 'ana', usuarioNombre: 'Ana' }),
      mov({ usuarioId: 'ana', usuarioNombre: 'Ana' }),
      mov({ usuarioId: 'beto', usuarioNombre: 'Beto' }),
      mov({ anulado: true }),
    ]);
    expect(c.porLocal[0].movimientos).toBe(3);
    expect(c.porLocal[0].porUsuario.map((u) => u.movimientos)).toEqual([2, 1]);
    expect(c.porUsuario.map((u) => u.movimientos)).toEqual([2, 1]);
  });

  it('un monto con decimales se trunca a centavos enteros', () => {
    // No debería llegar —la consulta convierte a centavos con redondeo— pero
    // si llega, medio centavo suelto por movimiento acaba en un total que no
    // da contra el cajón y nadie sabe de dónde salió el peso.
    const c = cuadrarDia([
      mov({ centavos: 10_000.9 }),
      mov({ centavos: 5_000.9 }),
    ]);
    expect(c.totales.totalCents).toBe(15_000);
  });

  it('los movimientos salen ordenados por hora: así se lee un cuadre', () => {
    const c = cuadrarDia([
      mov({ id: 'tarde', registradoEn: new Date('2026-08-22T22:00:00Z') }),
      mov({ id: 'mañana', registradoEn: new Date('2026-08-22T13:00:00Z') }),
    ]);
    expect(c.movimientos.map((m) => m.id)).toEqual(['mañana', 'tarde']);
  });
});

describe('descuadresDelDesglose', () => {
  it('un cuadre bien armado no reporta descuadres', () => {
    const c = cuadrarDia([
      mov({ metodo: 'EFECTIVO', centavos: 10_000 }),
      mov({
        metodo: 'TRANSFERENCIA',
        centavos: 5_000,
        usuarioId: 'beto',
        usuarioNombre: 'Beto',
      }),
      mov({
        origen: 'ABONO',
        centavos: 2_000,
        localId: 'l2',
        localNombre: 'Norte',
      }),
    ]);
    expect(descuadresDelDesglose(c)).toEqual([]);
  });

  it('canta el descuadre cuando el desglose por local no suma el total', () => {
    // Es la red que atrapa un error de agrupación antes de que la tienda
    // cuadre contra un número inventado.
    const c = cuadrarDia([mov({ centavos: 10_000 })]);
    c.porLocal[0].totales.totalCents = 9_000;
    expect(descuadresDelDesglose(c)).toEqual([
      { concepto: 'por local', esperadoCents: 10_000, sumadoCents: 9_000 },
    ]);
  });

  it('canta el descuadre cuando la suma por método no da el total', () => {
    const c = cuadrarDia([mov({ centavos: 10_000 })]);
    c.totales.efectivoCents = 8_000;
    expect(descuadresDelDesglose(c)).toContainEqual({
      concepto: 'por método',
      esperadoCents: 10_000,
      sumadoCents: 8_000,
    });
  });

  it('canta el descuadre cuando el desglose por vendedor no suma el total', () => {
    // El mismo vendedor puede aparecer en dos locales: es la agrupación con
    // más formas de salir mal, y la que se mira para decir "a Ana le faltan
    // 20.000".
    const c = cuadrarDia([mov({ centavos: 10_000 })]);
    c.porUsuario[0].totales.totalCents = 4_000;
    expect(descuadresDelDesglose(c)).toEqual([
      { concepto: 'por vendedor', esperadoCents: 10_000, sumadoCents: 4_000 },
    ]);
  });

  it('canta el descuadre cuando ventas + abonos no da el total', () => {
    const c = cuadrarDia([mov({ centavos: 10_000 })]);
    c.totales.ventasCents = 1_000;
    expect(descuadresDelDesglose(c)).toContainEqual({
      concepto: 'por origen',
      esperadoCents: 10_000,
      sumadoCents: 1_000,
    });
  });
});

describe('cuadrarEfectivo', () => {
  it('lo contado igual a lo esperado: cuadra', () => {
    expect(cuadrarEfectivo(100_000, 100_000)).toEqual({
      esperadoCents: 100_000,
      contadoCents: 100_000,
      diferenciaCents: 0,
      estado: 'CUADRA',
    });
  });

  it('si falta plata en el cajón, la diferencia es negativa', () => {
    const r = cuadrarEfectivo(100_000, 95_000);
    expect(r.diferenciaCents).toBe(-5_000);
    expect(r.estado).toBe('FALTA');
  });

  it('si sobra, también se dice: un sobrante es un error igual de grave', () => {
    const r = cuadrarEfectivo(100_000, 103_000);
    expect(r.diferenciaCents).toBe(3_000);
    expect(r.estado).toBe('SOBRA');
  });

  it('un día sin efectivo y sin conteo cuadra en cero', () => {
    expect(cuadrarEfectivo(0, 0).estado).toBe('CUADRA');
  });
});

describe('rangoUtcDelDia', () => {
  it('el día colombiano empieza a las 5 de la mañana UTC', () => {
    // El servidor corre en UTC. Sin esto, "hoy" arrancaba a las 7 de la tarde
    // de ayer y el cuadre traía las ventas de la tarde anterior.
    const { desde, hasta } = rangoUtcDelDia('2026-08-22', 'America/Bogota');
    expect(desde.toISOString()).toBe('2026-08-22T05:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-08-23T05:00:00.000Z');
  });

  it('una venta de las 11 de la noche es de ese día, no del siguiente', () => {
    // 2026-08-22 23:30 en Colombia = 2026-08-23 04:30 UTC.
    const venta = new Date('2026-08-23T04:30:00Z');
    const { desde, hasta } = rangoUtcDelDia('2026-08-22', 'America/Bogota');
    expect(venta >= desde && venta < hasta).toBe(true);
    expect(diaLocal(venta, 'America/Bogota')).toBe('2026-08-22');
  });

  it('el límite superior es exclusivo: la medianoche siguiente ya es otro día', () => {
    const { hasta } = rangoUtcDelDia('2026-08-22', 'America/Bogota');
    const medianoche = new Date('2026-08-23T05:00:00Z');
    expect(medianoche < hasta).toBe(false);
    expect(diaLocal(medianoche, 'America/Bogota')).toBe('2026-08-23');
  });

  it('respeta el horario de verano de una zona que sí lo tiene', () => {
    // Colombia no cambia la hora, pero la función no debe asumirlo: si mañana
    // se usa en otra zona, un offset fijo metería las ventas en el día vecino
    // media parte del año.
    const invierno = rangoUtcDelDia('2026-01-15', 'America/New_York');
    const verano = rangoUtcDelDia('2026-07-15', 'America/New_York');
    expect(invierno.desde.toISOString()).toBe('2026-01-15T05:00:00.000Z');
    expect(verano.desde.toISOString()).toBe('2026-07-15T04:00:00.000Z');
  });

  it('una fecha con forma inválida se rechaza en vez de traer un rango raro', () => {
    // Un `NaN` acá no falla: devuelve un rango vacío y la pantalla muestra
    // "hoy no entró nada", que es la peor forma de equivocarse.
    expect(() => rangoUtcDelDia('22/08/2026')).toThrow();
    expect(() => rangoUtcDelDia('')).toThrow();
  });
});

describe('diaLocal', () => {
  it('traduce un instante al día de la tienda', () => {
    expect(diaLocal(new Date('2026-08-22T15:00:00Z'), 'America/Bogota')).toBe(
      '2026-08-22',
    );
  });

  it('la madrugada UTC sigue siendo el día anterior en Colombia', () => {
    expect(diaLocal(new Date('2026-08-23T02:00:00Z'), 'America/Bogota')).toBe(
      '2026-08-22',
    );
  });
});
