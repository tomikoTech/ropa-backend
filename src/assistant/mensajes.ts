/**
 * Qué se le manda al modelo de Pintoso, y qué no.
 *
 * Dos reglas, puras y sin red: el historial se recorta (uno que crece sin fin
 * hace que cada pregunta cueste más cada vez, y no hace falta para atender), y
 * el system prompt —donde viven el conocimiento y las barreras— lo pone el
 * servidor de primero. El cliente nunca manda ni ve ese sistema.
 */

export interface MensajeChat {
  role: 'user' | 'assistant';
  content: string;
}

/** El sistema va aparte porque no lo escribe el cliente. */
export type MensajeConSistema = { role: 'system' | 'user' | 'assistant'; content: string };

/** Cuántos mensajes del ida y vuelta se conservan. */
export const MAX_MENSAJES_HISTORIAL = 12;
/** Tope de largo por mensaje, para que un pegote enorme no dispare el costo. */
export const MAX_LARGO_MENSAJE = 2000;

/**
 * Deja los últimos N mensajes válidos, cada uno recortado a un largo máximo.
 * Descarta lo que no sea de un rol conocido o venga vacío.
 */
export function recortarHistorial(
  historial: MensajeChat[],
  opts: { maxMensajes?: number; maxLargo?: number } = {},
): MensajeChat[] {
  const maxMensajes = opts.maxMensajes ?? MAX_MENSAJES_HISTORIAL;
  const maxLargo = opts.maxLargo ?? MAX_LARGO_MENSAJE;
  const limpios: MensajeChat[] = [];
  for (const m of historial) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (typeof m.content !== 'string' || m.content.trim() === '') continue;
    limpios.push({ role: m.role, content: m.content.slice(0, maxLargo) });
  }
  return limpios.slice(-maxMensajes);
}

/**
 * Arma la lista final para el modelo: el sistema de primero, luego el historial
 * recortado. Es lo único que sale hacia el proveedor del LLM.
 */
export function construirPayloadMensajes(
  system: string,
  historial: MensajeChat[],
  opts?: { maxMensajes?: number; maxLargo?: number },
): MensajeConSistema[] {
  return [{ role: 'system', content: system }, ...recortarHistorial(historial, opts)];
}
