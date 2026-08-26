/**
 * Por qué las descargas no pueden viajar con el token de sesión en la URL.
 *
 * Algunas descargas se abren con `window.open`, que no manda cabeceras, así que
 * el token iba como `?token=<access token>`. Un access token en la URL queda en
 * el historial del navegador, en la cabecera `Referer` y —lo peor— en los logs
 * de acceso del servidor, de donde alguien lo copia y tiene la sesión entera
 * durante sus 15 minutos de vida.
 *
 * La salida es un **ticket de descarga**: un token aparte, de 60 segundos y con
 * su propio `scope`, que se pide justo antes de abrir el archivo. Si se filtra
 * en un log, ya caducó; y como la estrategia JWT solo acepta por query los
 * tokens con este scope, un access token normal deja de servir puesto en la URL.
 *
 * Estas dos reglas son puras a propósito: deciden sin base de datos ni Passport,
 * y por eso se prueban solas.
 */

/** Marca del ticket. Un token sin este scope no se acepta por la URL. */
export const SCOPE_DESCARGA = 'download';

/** Cuánto vive el ticket. Corto para que un log filtrado no sirva de nada. */
export const TICKET_VIDA_SEGUNDOS = 60;

interface PayloadJwt {
  sub?: string;
  scope?: string;
}

interface PeticionMinima {
  headers?: { authorization?: string };
  query?: { token?: unknown };
}

/**
 * Si el token llegó por el query param `?token=` y no por la cabecera.
 *
 * Cuando vienen los dos, manda la cabecera (es como la lee Passport primero),
 * así que eso cuenta como uso normal, no como enlace de descarga.
 */
export function vinoPorQueryParam(req: PeticionMinima): boolean {
  const hayHeader = !!req.headers?.authorization;
  const hayQuery =
    typeof req.query?.token === 'string' && req.query.token.length > 0;
  return !hayHeader && hayQuery;
}

/**
 * Si este token puede aceptarse en esta petición.
 *
 * La regla es simétrica y por eso cierra las dos fugas de una vez:
 *
 * - **Por la URL** (`?token=`) solo pasa el ticket de descarga. Así el access
 *   token de sesión deja de funcionar puesto en la URL, que es lo que lo
 *   exponía en logs, historial y `Referer`.
 * - **Por la cabecera** no pasa el ticket. El ticket solo sirve para abrir la
 *   descarga con `window.open`; si se filtrara de un log, no podría usarse para
 *   pegarle a la API normal durante sus 60 segundos de vida.
 *
 * Cada token entra por donde le toca: el de sesión por cabecera, el ticket por
 * la URL. Cruzarlos se rechaza aunque la firma sea válida.
 */
export function ticketValidoParaLaPeticion(
  req: PeticionMinima,
  payload: PayloadJwt,
): boolean {
  const esTicket = payload?.scope === SCOPE_DESCARGA;
  return vinoPorQueryParam(req) ? esTicket : !esTicket;
}
