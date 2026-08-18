import { MovementType } from '../common/enums/movement-type.enum.js';
import {
  desdeInicioDelDia,
  hastaFinDelDia,
  isAbsoluteMovement,
  movementDelta,
  normalizeStoredQuantity,
  runningBalance,
} from './movement-delta.js';

/**
 * El caso que motivó esto: en Distri Amber, la misma salida quedó guardada de
 * dos formas —la venta como `OUT −8` y el ajuste desde Productos como
 * `OUT 9`—, así que el historial no se podía leer sumando la columna.
 */
describe('movementDelta', () => {
  it('una salida resta, venga escrita positiva o negativa', () => {
    // Así la escribe una venta.
    expect(movementDelta(MovementType.OUT, -8)).toBe(-8);
    // Y así el ajuste rápido desde Productos, para la misma operación.
    expect(movementDelta(MovementType.OUT, 9)).toBe(-9);
  });

  it('una entrada suma, venga como venga', () => {
    expect(movementDelta(MovementType.IN, 96)).toBe(96);
    expect(movementDelta(MovementType.IN, -6)).toBe(6);
  });

  it('el traslado conserva su signo: son dos filas, origen y destino', () => {
    expect(movementDelta(MovementType.TRANSFER, -5)).toBe(-5);
    expect(movementDelta(MovementType.TRANSFER, 5)).toBe(5);
  });

  it('el ajuste no es un delta, así que no devuelve uno', () => {
    expect(movementDelta(MovementType.ADJUSTMENT, 38)).toBeNull();
    expect(isAbsoluteMovement(MovementType.ADJUSTMENT)).toBe(true);
    expect(isAbsoluteMovement(MovementType.OUT)).toBe(false);
  });
});

describe('normalizeStoredQuantity (cómo se guarda)', () => {
  it('una salida se guarda negativa, la mande quien la mande', () => {
    // Así la escribían compras, producción, recetas, conteos, calle,
    // devoluciones y el ajuste rápido: en positivo.
    expect(normalizeStoredQuantity(MovementType.OUT, 9)).toBe(-9);
    // Y así el POS, que ya lo hacía bien.
    expect(normalizeStoredQuantity(MovementType.OUT, -8)).toBe(-8);
  });

  it('una entrada se guarda positiva', () => {
    expect(normalizeStoredQuantity(MovementType.IN, 96)).toBe(96);
    expect(normalizeStoredQuantity(MovementType.IN, -96)).toBe(96);
  });

  it('no le toca el signo al traslado: ahí dice de qué bodega salió', () => {
    expect(normalizeStoredQuantity(MovementType.TRANSFER, -5)).toBe(-5);
    expect(normalizeStoredQuantity(MovementType.TRANSFER, 5)).toBe(5);
  });

  it('un conteo físico no es negativo', () => {
    expect(normalizeStoredQuantity(MovementType.ADJUSTMENT, 38)).toBe(38);
    expect(normalizeStoredQuantity(MovementType.ADJUSTMENT, -38)).toBe(38);
  });

  it('el cero no cambia de signo', () => {
    expect(Object.is(normalizeStoredQuantity(MovementType.OUT, 0), -0)).toBe(
      false,
    );
    expect(normalizeStoredQuantity(MovementType.OUT, 0)).toBe(0);
  });

  it('guardar y volver a guardar da lo mismo', () => {
    // Importa: la migración corre sobre datos que ya pasaron por acá.
    const unaVez = normalizeStoredQuantity(MovementType.OUT, 9);
    expect(normalizeStoredQuantity(MovementType.OUT, unaVez)).toBe(unaVez);
  });

  it('lo guardado y lo leído coinciden', () => {
    // Si estas dos se separan, el saldo se calcula sobre otra convención.
    for (const tipo of [MovementType.IN, MovementType.OUT]) {
      for (const q of [7, -7]) {
        expect(normalizeStoredQuantity(tipo, q)).toBe(movementDelta(tipo, q));
      }
    }
  });
});

describe('extremos del día (filtro de fechas)', () => {
  it('«hasta el 18» llega al final del 18, no del 17', () => {
    // El error: `new Date('2026-08-18')` es medianoche UTC, que en Colombia
    // son las 7 p.m. del 17. Con eso el filtro cortaba un día antes y la
    // tienda veía la pantalla vacía al buscar los movimientos de hoy.
    const fin = hastaFinDelDia('2026-08-18');
    expect(fin.getDate()).toBe(18);
    expect(fin.getMonth()).toBe(7);
    expect(fin.getHours()).toBe(23);
    expect(fin.getMinutes()).toBe(59);
  });

  it('«desde el 18» arranca a la medianoche del 18', () => {
    const ini = desdeInicioDelDia('2026-08-18');
    expect(ini.getDate()).toBe(18);
    expect(ini.getHours()).toBe(0);
    expect(ini.getMinutes()).toBe(0);
  });

  it('un movimiento de la tarde cae dentro del mismo día', () => {
    const movimiento = new Date(2026, 7, 18, 18, 21, 0);
    expect(movimiento >= desdeInicioDelDia('2026-08-18')).toBe(true);
    expect(movimiento <= hastaFinDelDia('2026-08-18')).toBe(true);
  });

  it('el último instante del día anterior queda afuera', () => {
    const ayerTarde = new Date(2026, 7, 17, 23, 59, 59);
    expect(ayerTarde >= desdeInicioDelDia('2026-08-18')).toBe(false);
  });

  it('no revienta con una fecha mal formada', () => {
    expect(hastaFinDelDia('cualquier cosa').toString()).toContain('Invalid');
  });
});

describe('runningBalance', () => {
  it('reconstruye el saldo de un producto real (9 PM NIGHT OUD)', () => {
    // El historial de agosto tal como quedó en la base, con el ajuste ya
    // corregido. Termina en 12, que es el conteo físico de la tienda.
    const historial = [
      { movementType: MovementType.IN, quantity: 96 },
      { movementType: MovementType.OUT, quantity: 1 }, // ajuste: positivo
      { movementType: MovementType.OUT, quantity: -26 }, // venta: negativo
      { movementType: MovementType.OUT, quantity: -6 },
      { movementType: MovementType.OUT, quantity: -36 },
      { movementType: MovementType.OUT, quantity: -8 }, // la factura anulada
      { movementType: MovementType.OUT, quantity: -6 },
      { movementType: MovementType.IN, quantity: 8 }, // su anulación
      { movementType: MovementType.OUT, quantity: 9 }, // conteo físico
      { movementType: MovementType.OUT, quantity: -8 }, // la refacturación
      { movementType: MovementType.IN, quantity: 8 }, // el reintegro
    ];

    const conSaldo = runningBalance(historial);
    expect(conSaldo[conSaldo.length - 1].balance).toBe(12);
  });

  it('un ajuste fija el saldo y no arrastra lo anterior', () => {
    const conSaldo = runningBalance([
      { movementType: MovementType.IN, quantity: 100 },
      { movementType: MovementType.OUT, quantity: 30 },
      { movementType: MovementType.ADJUSTMENT, quantity: 38 }, // «quedó en 38»
      { movementType: MovementType.OUT, quantity: -6 },
    ]);

    expect(conSaldo.map((m) => m.balance)).toEqual([100, 70, 38, 32]);
    expect(conSaldo[2].delta).toBeNull();
  });

  it('sumar la columna a secas daría un número equivocado', () => {
    // Esta es la trampa: la salida está escrita en positivo.
    const historial = [
      { movementType: MovementType.IN, quantity: 20 },
      { movementType: MovementType.OUT, quantity: 5 },
    ];

    const crudo = historial.reduce((t, m) => t + m.quantity, 0);
    expect(crudo).toBe(25); // lo que se vería sin normalizar

    const real = runningBalance(historial);
    expect(real[real.length - 1].balance).toBe(15);
  });

  it('arranca de un saldo previo cuando se pide una ventana de fechas', () => {
    const conSaldo = runningBalance(
      [{ movementType: MovementType.OUT, quantity: -2 }],
      10,
    );
    expect(conSaldo[0].balance).toBe(8);
  });

  it('con historial vacío no revienta', () => {
    expect(runningBalance([])).toEqual([]);
  });
});
