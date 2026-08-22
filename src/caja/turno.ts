/**
 * Cuándo un turno cerrado impide seguir vendiendo.
 *
 * Nace de una queja concreta: «los vendedores estaban vendiendo y liquidando a
 * las 10 de la noche». Cerrado el turno, esa persona no factura ni presta más
 * en ese local hasta el día siguiente.
 *
 * Sobre todas las reglas manda una: **dejar a alguien sin poder vender por un
 * cierre mal hecho es peor que el problema que resuelve.** De ahí salen las
 * tres decisiones de este archivo:
 *
 * 1. El bloqueo es lo más estrecho posible: **esa** persona, **ese** local,
 *    **ese** día. El cierre de Ana no puede dejar a Beto sin cobrar la venta
 *    que tiene en el mostrador.
 * 2. Se abre solo al cambiar el día. Nadie tiene que acordarse de reabrir cada
 *    mañana.
 * 3. Un administrador puede reabrirlo a mano en cualquier momento.
 *
 * Puro a propósito: la decisión de trancar una caja es demasiado cara para
 * probarla solo levantando una base de datos.
 */

export interface CierreDeTurno {
  id: string;
  localId: string;
  usuarioId: string;
  /** Día de la tienda (`YYYY-MM-DD`), no el instante en que se cerró. */
  dia: string;
  /** Cuándo lo reabrió un administrador. Nulo = sigue cerrado. */
  reabiertoEn: Date | null;
}

export interface ContextoDeTurno {
  /** El interruptor de la tienda. Apagado por defecto. */
  habilitado: boolean;
  localId: string;
  usuarioId: string;
  dia: string;
}

/** El cierre vigente que impide operar, o `null` si se puede. */
export function cierreQueBloquea(
  cierres: CierreDeTurno[],
  ctx: ContextoDeTurno,
): CierreDeTurno | null {
  // Con la función apagada no se mira nada. Una tienda que la probó, la apagó
  // y dejó un cierre viejo escrito no puede quedar trancada por él.
  if (!ctx.habilitado) return null;
  return (
    cierres.find(
      (c) =>
        c.reabiertoEn === null &&
        c.dia === ctx.dia &&
        c.localId === ctx.localId &&
        c.usuarioId === ctx.usuarioId,
    ) ?? null
  );
}

/**
 * Qué decirle a quien se topa con el bloqueo.
 *
 * Nombra la salida, no solo la pared: quien queda trancado con un cliente
 * enfrente necesita saber a quién llamar, no que "no tiene permiso".
 */
export function motivoDelBloqueo(cierre: CierreDeTurno): string {
  return (
    `Tu turno del ${cierre.dia} en este local ya está cerrado, ` +
    `así que no puedes registrar más ventas ni préstamos hoy. ` +
    `Un administrador puede reabrirlo desde Cuadre de caja.`
  );
}

export type PuedeCerrar =
  // `motivo?: undefined` en la rama buena para que quien reciba el resultado
  // pueda leer `.motivo` sin estrechar el tipo primero: la alternativa es un
  // `if` ceremonial en cada llamada.
  { ok: true; motivo?: undefined } | { ok: false; motivo: string };

/**
 * ¿Se puede cerrar este turno?
 *
 * `hoy` se inyecta para poder probarlo y porque el "hoy" que vale es el de la
 * tienda, no el del servidor.
 */
export function puedeCerrarse(
  cierres: CierreDeTurno[],
  ctx: ContextoDeTurno,
  hoy?: string,
): PuedeCerrar {
  if (!ctx.habilitado) {
    return {
      ok: false,
      motivo:
        'El cierre de turno no está activo en esta tienda. ' +
        'Se enciende en la configuración.',
    };
  }
  if (hoy && ctx.dia > hoy) {
    return {
      ok: false,
      motivo: `No se puede cerrar el ${ctx.dia}: todavía no ha llegado.`,
    };
  }
  // Se mira con el interruptor ya encendido, así que basta el mismo criterio
  // que usa el bloqueo: si hay uno vigente, no hay nada que cerrar.
  if (cierreQueBloquea(cierres, ctx)) {
    return {
      ok: false,
      motivo: `Ese turno ya está cerrado. Para volver a cerrarlo hay que reabrirlo primero.`,
    };
  }
  return { ok: true };
}
