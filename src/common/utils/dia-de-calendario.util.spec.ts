import { diaDeCalendario } from './dia-de-calendario.util.js';

/**
 * El día del calendario, sin que una zona horaria lo corra.
 *
 * Salió de un gasto registrado el 22 de agosto que quedó guardado como el 21.
 * La causa: `new Date('2026-08-22')` es medianoche **UTC**, que en Colombia
 * son las siete de la tarde del 21; al escribirlo en una columna `date`, el
 * driver toma la fecha local y retrocede un día.
 *
 * Un gasto en el día equivocado desordena el balance del mes, y una fecha de
 * vencimiento corrida hace que una cuenta se vea vencida un día antes.
 */

// Instante fijo: 22 de agosto de 2026, 2 de la mañana UTC = 21 a las 9 de la
// noche en Colombia. Es justo la franja donde los dos días no coinciden.
const MADRUGADA_UTC = new Date('2026-08-22T02:00:00.000Z');

describe('diaDeCalendario', () => {
  it('un día ya escrito como día se devuelve igual', () => {
    // Este es el caso que importa: el usuario eligió una fecha en la pantalla
    // y esa es la fecha, sin interpretaciones.
    expect(diaDeCalendario('2026-08-22')).toBe('2026-08-22');
  });

  it('no lo corre aunque el proceso esté en otra zona', () => {
    expect(diaDeCalendario('2026-01-01')).toBe('2026-01-01');
    expect(diaDeCalendario('2026-12-31')).toBe('2026-12-31');
  });

  it('un instante se traduce al día de la tienda, no al de UTC', () => {
    // Las 9 de la noche del 21 en Colombia son el 22 en UTC. El gasto es del
    // 21: es cuando la tienda lo pagó.
    expect(diaDeCalendario(MADRUGADA_UTC)).toBe('2026-08-21');
  });

  it('una marca de tiempo con texto también', () => {
    expect(diaDeCalendario('2026-08-22T02:00:00.000Z')).toBe('2026-08-21');
  });

  it('sin fecha, hoy en la tienda', () => {
    expect(diaDeCalendario(undefined, MADRUGADA_UTC)).toBe('2026-08-21');
    expect(diaDeCalendario(null, MADRUGADA_UTC)).toBe('2026-08-21');
    expect(diaDeCalendario('', MADRUGADA_UTC)).toBe('2026-08-21');
  });

  it('el mediodía UTC cae en el mismo día en los dos lados', () => {
    expect(diaDeCalendario(new Date('2026-08-22T12:00:00.000Z'))).toBe(
      '2026-08-22',
    );
  });

  it('una fecha imposible revienta en vez de inventarse un día', () => {
    // Guardar «hoy» cuando llega basura esconde el error y deja un gasto con
    // fecha equivocada, que es peor que un 400.
    expect(() => diaDeCalendario('22/08/2026')).toThrow(/Fecha inválida/);
    expect(() => diaDeCalendario('no es una fecha')).toThrow(/Fecha inválida/);
    expect(() => diaDeCalendario(new Date('x'))).toThrow(/Fecha inválida/);
  });

  it('rechaza un día que no existe en el calendario', () => {
    // `2026-02-31` pasa el patrón pero no es un día: `new Date` lo correría al
    // 3 de marzo sin avisar.
    expect(() => diaDeCalendario('2026-02-31')).toThrow(/Fecha inválida/);
    expect(() => diaDeCalendario('2026-13-01')).toThrow(/Fecha inválida/);
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(diaDeCalendario('2028-02-29')).toBe('2028-02-29');
  });
});
