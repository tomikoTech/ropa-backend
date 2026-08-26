import {
  SCOPE_DESCARGA,
  ticketValidoParaLaPeticion,
  vinoPorQueryParam,
} from './ticket-de-descarga.js';

const conHeader = { headers: { authorization: 'Bearer abc' }, query: {} };
const conQuery = { headers: {}, query: { token: 'abc' } };
const conAmbos = { headers: { authorization: 'Bearer abc' }, query: { token: 'abc' } };

describe('vinoPorQueryParam', () => {
  it('es cierto solo cuando el token va en la URL y no en la cabecera', () => {
    expect(vinoPorQueryParam(conQuery)).toBe(true);
  });

  it('la cabecera manda: si están las dos, no cuenta como enlace', () => {
    // Passport lee primero la cabecera; si hay cabecera, es uso normal.
    expect(vinoPorQueryParam(conAmbos)).toBe(false);
    expect(vinoPorQueryParam(conHeader)).toBe(false);
  });

  it('un token de query vacío no cuenta', () => {
    expect(vinoPorQueryParam({ headers: {}, query: { token: '' } })).toBe(false);
    expect(vinoPorQueryParam({ headers: {}, query: {} })).toBe(false);
  });
});

describe('ticketValidoParaLaPeticion', () => {
  it('por la URL solo pasa el ticket de descarga', () => {
    expect(ticketValidoParaLaPeticion(conQuery, { scope: SCOPE_DESCARGA })).toBe(true);
  });

  it('por la URL, el access token normal (sin scope) se rechaza', () => {
    // Este es el caso que exponía la sesión entera en los logs.
    expect(ticketValidoParaLaPeticion(conQuery, { sub: 'u1' })).toBe(false);
    expect(ticketValidoParaLaPeticion(conQuery, { scope: 'otra-cosa' })).toBe(false);
  });

  it('por la cabecera pasa el token de sesión (sin scope de descarga)', () => {
    expect(ticketValidoParaLaPeticion(conHeader, { sub: 'u1' })).toBe(true);
    expect(ticketValidoParaLaPeticion(conAmbos, { sub: 'u1' })).toBe(true);
  });

  it('por la cabecera, el ticket de descarga NO sirve para la API general', () => {
    // El ticket solo abre descargas por la URL. Si se filtrara de un log, que no
    // pueda pegarle a la API normal por cabecera durante sus 60 s de vida.
    expect(ticketValidoParaLaPeticion(conHeader, { scope: SCOPE_DESCARGA })).toBe(false);
  });
});
