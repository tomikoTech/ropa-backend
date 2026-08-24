import { codigosDeLaApertura, paresDeLaCaja } from './reparto-de-pares.js';
import { BARCODE_LIMITS, withCheckDigit } from './barcode.util.js';

/** Una caja de una orden de compra: su renglón sí se puede continuar. */
const conOrden = (renglon: number, unidad: number) =>
  withCheckDigit(
    `260807` +
      '0029' +
      String(renglon).padStart(3, '0') +
      String(unidad).padStart(3, '0'),
  );

/** Una caja del espacio del día: orden 0000, la que administra el ledger. */
const delDia = (renglon: number, unidad: number) =>
  withCheckDigit(
    `260823` +
      '0000' +
      String(renglon).padStart(3, '0') +
      String(unidad).padStart(3, '0'),
  );

const repartirParesDeLaCaja = (ultimaUnidadUsada: number, cantidad: number) =>
  paresDeLaCaja({
    codigoDeLaCaja: conOrden(1, 1),
    ultimaUnidadUsada,
    cantidad,
  });

describe('repartirParesDeLaCaja', () => {
  it('los pares siguen el renglón de la caja, empezando después del último', () => {
    // Una caja de 12 pares en un renglón donde ya se emitieron 3 códigos.
    expect(repartirParesDeLaCaja(3, 12)).toEqual({
      enElRenglon: { desdeUnidad: 4, cuantas: 12 },
      faltan: 0,
    });
  });

  it('un renglón virgen empieza en 1, no en 0', () => {
    // El puesto 000 no existe en el formato: el primer bulto es el 001.
    expect(repartirParesDeLaCaja(0, 2).enElRenglon).toEqual({
      desdeUnidad: 1,
      cuantas: 2,
    });
  });

  it('lo que no cabe en el renglón queda contado aparte', () => {
    // El caso que creaba códigos de 18 dígitos en silencio.
    const reparto = repartirParesDeLaCaja(BARCODE_LIMITS.unit - 5, 12);
    expect(reparto.enElRenglon).toEqual({ desdeUnidad: 995, cuantas: 5 });
    expect(reparto.faltan).toBe(7);
  });

  it('con el renglón lleno no se emite ni un código ahí', () => {
    expect(repartirParesDeLaCaja(BARCODE_LIMITS.unit, 8)).toEqual({
      enElRenglon: null,
      faltan: 8,
    });
  });

  it('un renglón pasado de la raya tampoco emite: no retrocede ni desborda', () => {
    // Puede pasar con datos viejos o importados.
    expect(repartirParesDeLaCaja(BARCODE_LIMITS.unit + 40, 3)).toEqual({
      enElRenglon: null,
      faltan: 3,
    });
  });

  it('el último puesto libre se usa: 999 es válido, no se deja vacío', () => {
    const reparto = repartirParesDeLaCaja(BARCODE_LIMITS.unit - 1, 1);
    expect(reparto).toEqual({
      enElRenglon: { desdeUnidad: 999, cuantas: 1 },
      faltan: 0,
    });
  });

  it('una última unidad absurda no produce códigos absurdos', () => {
    // Hoy ningún llamador puede pasar un negativo —sale de `max + 1 - 1`—,
    // pero la función es pública y el tipo lo permite. Sin el tope, un -5
    // arrancaría en la unidad -4 y armaría un código inválido en silencio,
    // que es justo el defecto que este archivo existe para cerrar.
    expect(repartirParesDeLaCaja(-5, 2).enElRenglon).toEqual({
      desdeUnidad: 1,
      cuantas: 2,
    });
    expect(repartirParesDeLaCaja(2.7, 1).enElRenglon).toEqual({
      desdeUnidad: 3,
      cuantas: 1,
    });
  });

  it('abrir una caja vacía no pide códigos', () => {
    expect(repartirParesDeLaCaja(10, 0)).toEqual({
      enElRenglon: null,
      faltan: 0,
    });
  });

  it('todo lo que reparte cabe en el formato de 17 dígitos', () => {
    // La prueba de la que se trata todo: se arma el código como lo arma la
    // apertura y se mide. Con el desbordamiento salían 18.
    const cuerpoDelRenglon = '2608070029001';
    for (const [ultima, cantidad] of [
      [0, 5],
      [3, 12],
      [990, 30],
      [998, 4],
    ] as const) {
      const { enElRenglon } = repartirParesDeLaCaja(ultima, cantidad);
      if (!enElRenglon) continue;
      for (let i = 0; i < enElRenglon.cuantas; i++) {
        const unidad = enElRenglon.desdeUnidad + i;
        const codigo = withCheckDigit(
          cuerpoDelRenglon + String(unidad).padStart(3, '0'),
        );
        expect(codigo).toHaveLength(17);
      }
    }
  });

  it('nunca reparte más pares de los que le piden', () => {
    for (let ultima = 0; ultima <= 1005; ultima += 37) {
      const { enElRenglon, faltan } = repartirParesDeLaCaja(ultima, 24);
      expect((enElRenglon?.cuantas ?? 0) + faltan).toBe(24);
    }
  });
});

describe('codigosDeLaApertura', () => {
  const CUERPO = '2608070029001';
  const FECHA = new Date(2026, 7, 23);

  it('continúa el renglón de la caja, en orden y sin saltos', () => {
    const codigos = codigosDeLaApertura({
      cuerpoDelRenglon: CUERPO,
      enElRenglon: { desdeUnidad: 4, cuantas: 3 },
      tramosDelDia: [],
      fecha: FECHA,
    });
    expect(codigos).toEqual([
      '2608070029001004',
      '2608070029001005',
      '2608070029001006',
    ]);
  });

  it('lo que se desbordó sale del tramo del día, detrás de lo que sí cupo', () => {
    const codigos = codigosDeLaApertura({
      cuerpoDelRenglon: CUERPO,
      enElRenglon: { desdeUnidad: 998, cuantas: 2 },
      tramosDelDia: [{ renglon: 7, desdeUnidad: 1, cuantas: 2 }],
      fecha: FECHA,
    });
    expect(codigos).toEqual([
      '2608070029001998',
      '2608070029001999',
      // Fecha del día, orden 0000 —lo que entra sin orden de compra—, renglón 7.
      '2608230000007001',
      '2608230000007002',
    ]);
  });

  it('con el renglón lleno, todos los pares salen del día', () => {
    const codigos = codigosDeLaApertura({
      cuerpoDelRenglon: CUERPO,
      enElRenglon: null,
      tramosDelDia: [{ renglon: 12, desdeUnidad: 500, cuantas: 3 }],
      fecha: FECHA,
    });
    expect(codigos).toEqual([
      '2608230000012500',
      '2608230000012501',
      '2608230000012502',
    ]);
  });

  it('encadena varios tramos del día sin perder ni repetir ninguno', () => {
    const codigos = codigosDeLaApertura({
      cuerpoDelRenglon: CUERPO,
      enElRenglon: null,
      tramosDelDia: [
        { renglon: 3, desdeUnidad: 998, cuantas: 2 },
        { renglon: 4, desdeUnidad: 1, cuantas: 2 },
      ],
      fecha: FECHA,
    });
    expect(codigos).toEqual([
      '2608230000003998',
      '2608230000003999',
      '2608230000004001',
      '2608230000004002',
    ]);
    expect(new Set(codigos).size).toBe(4);
  });

  it('todos los cuerpos miden 16 dígitos, vengan de donde vengan', () => {
    const codigos = codigosDeLaApertura({
      cuerpoDelRenglon: CUERPO,
      enElRenglon: { desdeUnidad: 995, cuantas: 5 },
      tramosDelDia: [{ renglon: 9, desdeUnidad: 1, cuantas: 7 }],
      fecha: FECHA,
    });
    expect(codigos).toHaveLength(12);
    for (const codigo of codigos) expect(codigo).toMatch(/^\d{16}$/);
  });

  it('sin nada que repartir devuelve una lista vacía, no un código suelto', () => {
    expect(
      codigosDeLaApertura({
        cuerpoDelRenglon: CUERPO,
        enElRenglon: null,
        tramosDelDia: [],
        fecha: FECHA,
      }),
    ).toEqual([]);
  });
});

describe('paresDeLaCaja · de qué espacio salen los códigos', () => {
  it('una caja de orden de compra continúa su propio renglón', () => {
    // Es lo que deja el código del par a un dígito del de su caja.
    expect(
      paresDeLaCaja({
        codigoDeLaCaja: conOrden(1, 3),
        ultimaUnidadUsada: 3,
        cantidad: 12,
      }),
    ).toEqual({ enElRenglon: { desdeUnidad: 4, cuantas: 12 }, faltan: 0 });
  });

  it('una caja del espacio del día no toma códigos a mano: los pide todos', () => {
    // El defecto que esto cierra: la apertura tomaba los puestos libres del
    // renglón y el ledger, que lee la base para saber cuáles están libres,
    // entregaba esos mismos. Dos pares con la misma etiqueta impresa.
    expect(
      paresDeLaCaja({
        codigoDeLaCaja: delDia(15, 984),
        ultimaUnidadUsada: 984,
        cantidad: 24,
      }),
    ).toEqual({ enElRenglon: null, faltan: 24 });
  });

  it('un código ajeno no presta su renglón: sus dígitos no significan lo mismo', () => {
    // Los de demachine: 18 dígitos y sin verificador.
    expect(
      paresDeLaCaja({
        codigoDeLaCaja: '260807002900100101',
        ultimaUnidadUsada: 1,
        cantidad: 6,
      }),
    ).toEqual({ enElRenglon: null, faltan: 6 });
  });

  it('ni siquiera un código ajeno que pase el verificador por azar', () => {
    // El 9,5% de los de demachine lo pasan de casualidad —es exactamente el
    // azar—. Sin el control de largo, esos sí prestarían su renglón, y sus
    // dígitos están corridos una posición respecto a los nuestros.
    const dieciocho = withCheckDigit('26080700290010010');
    expect(dieciocho).toHaveLength(18);
    expect(
      paresDeLaCaja({
        codigoDeLaCaja: dieciocho,
        ultimaUnidadUsada: 1,
        cantidad: 6,
      }),
    ).toEqual({ enElRenglon: null, faltan: 6 });
  });

  it('un código de nuestro largo pero con el verificador malo tampoco', () => {
    const bueno = conOrden(1, 1);
    const malo = bueno.slice(0, 16) + String((Number(bueno[16]) + 1) % 10);
    expect(
      paresDeLaCaja({
        codigoDeLaCaja: malo,
        ultimaUnidadUsada: 1,
        cantidad: 6,
      }),
    ).toEqual({ enElRenglon: null, faltan: 6 });
  });

  it('lo que no cabe en el renglón de la orden se pide aparte', () => {
    const reparto = paresDeLaCaja({
      codigoDeLaCaja: conOrden(1, 995),
      ultimaUnidadUsada: BARCODE_LIMITS.unit - 5,
      cantidad: 12,
    });
    expect(reparto.enElRenglon).toEqual({ desdeUnidad: 995, cuantas: 5 });
    expect(reparto.faltan).toBe(7);
  });

  it('abrir una caja vacía no pide códigos, venga de donde venga', () => {
    for (const codigo of [delDia(1, 1), conOrden(1, 1)]) {
      expect(
        paresDeLaCaja({ codigoDeLaCaja: codigo, ultimaUnidadUsada: 0, cantidad: 0 }),
      ).toEqual({ enElRenglon: null, faltan: 0 });
    }
  });

  it('una cantidad absurda no se convierte en un pedido absurdo al ledger', () => {
    // Por la rama del día la cantidad viaja tal cual a `faltan`, y de ahí a
    // `reservarEtiquetas`. Un negativo sin normalizar le pediría al ledger un
    // número negativo de etiquetas.
    expect(
      paresDeLaCaja({
        codigoDeLaCaja: delDia(1, 1),
        ultimaUnidadUsada: 0,
        cantidad: -3,
      }),
    ).toEqual({ enElRenglon: null, faltan: 0 });
  });
});
