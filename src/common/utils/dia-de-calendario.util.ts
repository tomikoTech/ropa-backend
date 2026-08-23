import { diaLocal } from '../../caja/cuadre.js';

/**
 * El día del calendario, sin que una zona horaria lo corra.
 *
 * Salió de un gasto registrado el 22 de agosto que quedó guardado como el 21.
 * La causa es vieja y conocida: `new Date('2026-08-22')` es medianoche
 * **UTC** —las siete de la tarde del 21 en Colombia—, y al escribirla en una
 * columna `date` el driver toma la fecha local y retrocede un día.
 *
 * Un gasto en el día equivocado desordena el balance del mes; una fecha de
 * vencimiento corrida hace que una cuenta se vea vencida un día antes de
 * estarlo. Por eso lo que va a una columna `date` se guarda como **texto**:
 * un día no es un instante, y tratarlo como instante es lo que lo rompe.
 *
 * Es el mismo criterio con el que `cierres_de_caja.dia` guarda su jornada.
 */

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function diaDeCalendario(
  valor?: string | Date | null,
  ahora: Date = new Date(),
): string {
  if (valor === undefined || valor === null || valor === '') {
    return diaLocal(ahora);
  }

  if (typeof valor === 'string') {
    if (DIA_ISO.test(valor)) {
      // Ya es un día: se devuelve tal cual, sin pasar por `Date`. Este es el
      // caso normal —la fecha que el usuario eligió en la pantalla— y el que
      // se estaba corriendo un día.
      const [y, m, d] = valor.split('-').map(Number);
      const comprobacion = new Date(Date.UTC(y, m - 1, d));
      const existe =
        comprobacion.getUTCFullYear() === y &&
        comprobacion.getUTCMonth() === m - 1 &&
        comprobacion.getUTCDate() === d;
      // `2026-02-31` pasa el patrón pero no es un día: `new Date` lo correría
      // al 3 de marzo sin decir nada.
      if (!existe) throw new Error(`Fecha inválida: "${valor}".`);
      return valor;
    }
    const instante = new Date(valor);
    if (Number.isNaN(instante.getTime())) {
      // Reventar es mejor que guardar «hoy»: un gasto con la fecha equivocada
      // no se descubre hasta que el mes no cuadra.
      throw new Error(
        `Fecha inválida: "${valor}". Se espera AAAA-MM-DD o una fecha ISO.`,
      );
    }
    return diaLocal(instante);
  }

  if (Number.isNaN(valor.getTime())) {
    throw new Error('Fecha inválida.');
  }
  return diaLocal(valor);
}
