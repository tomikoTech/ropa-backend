import { MovementType } from '../common/enums/movement-type.enum.js';
import {
  isAbsoluteMovement,
  movementDelta,
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
