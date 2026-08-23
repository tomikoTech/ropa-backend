/**
 * Qué se puede guardar en la bitácora y qué no.
 *
 * El interceptor guardaba **el cuerpo entero de cada petición**, sin mirar qué
 * traía. En producción eso dejó, durante cinco meses: 293 contraseñas en texto
 * plano de 13 usuarios, 900 tokens de sesión, los secretos de la pasarela de
 * pagos y el token de WhatsApp. Cualquiera con lectura a la base —o a uno de
 * los respaldos— los tenía.
 *
 * Y aparte, 90 de los 96 MB de la tabla eran **fotos de productos en base64**,
 * duplicadas de las que ya viven en R2.
 *
 * La bitácora existe para saber **quién hizo qué y cuándo**. Para eso no hace
 * falta el valor de una clave: basta con saber que el campo venía. Por eso se
 * tapa en vez de borrarse —borrarlo escondería que el intento traía una— y por
 * eso las imágenes se cuentan en vez de guardarse.
 *
 * Dos guardas redundantes, dichas de frente: el anticírculos y el tope de
 * profundidad protegen de lo mismo —una estructura que se apunta a sí misma—
 * y quitar cualquiera de las dos por separado no rompe nada. Quitar las dos
 * revienta con «Maximum call stack size exceeded», y eso sí está probado. Se
 * dejan las dos porque el tope da un mensaje útil y el anticírculos da el
 * correcto.
 */

/** Lo que se pone en lugar de un valor sensible. */
const OCULTO = '[oculto]';

/**
 * Nombres cuyo **valor** nunca se guarda.
 *
 * Se comparan sin mayúsculas, sin guiones y sin guiones bajos, porque el mismo
 * campo llega escrito de tres formas según el endpoint: `refreshToken`,
 * `refresh_token`, `X-Refresh-Token`.
 */
const SENSIBLES = [
  'password',
  'clave',
  'token',
  'secret',
  'secreto',
  'apikey',
  'authorization',
  'pin',
];

/** Nombres cuyo contenido es binario: se cuenta, no se guarda. */
const BINARIOS = ['base64', 'imagen', 'image', 'foto', 'archivo', 'file'];

/**
 * Tope de una cadena suelta.
 *
 * Una foto puede llegar como texto sin llamarse `base64`, y entonces ni el
 * nombre ni el tipo la delatan. El tope es lo único que protege de eso.
 */
const TOPE_TEXTO = 1_000;

/** Hasta dónde bajar. Más hondo que esto no hay cuerpos reales. */
const PROFUNDIDAD_MAXIMA = 8;

const normalizar = (clave: string) =>
  clave.toLowerCase().replace(/[-_\s]/g, '');

const esSensible = (clave: string) => {
  const k = normalizar(clave);
  return SENSIBLES.some((s) => k.includes(s));
};

const esBinario = (clave: string) => {
  const k = normalizar(clave);
  return BINARIOS.some((b) => k.includes(b));
};

function limpiarValor(
  valor: unknown,
  profundidad: number,
  vistos: WeakSet<object>,
): unknown {
  if (valor === null || valor === undefined) return valor;

  if (typeof valor === 'string') {
    return valor.length > TOPE_TEXTO
      ? `${valor.slice(0, TOPE_TEXTO)}… [recortado, ${valor.length} caracteres]`
      : valor;
  }

  if (typeof valor !== 'object') return valor;

  // Una estructura que se referencia a sí misma colgaría el proceso, y la
  // bitácora nunca puede tumbar la petición que está auditando.
  if (vistos.has(valor as object)) return '[referencia circular]';
  if (profundidad >= PROFUNDIDAD_MAXIMA) return '[demasiado hondo]';
  vistos.add(valor as object);

  if (Array.isArray(valor)) {
    return valor.map((v) => limpiarValor(v, profundidad + 1, vistos));
  }

  const salida: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (esSensible(clave)) {
      salida[clave] = OCULTO;
      continue;
    }
    if (esBinario(clave)) {
      salida[clave] = Array.isArray(v)
        ? `[${v.length} imagen(es) omitida(s)]`
        : '[contenido omitido]';
      continue;
    }
    salida[clave] = limpiarValor(v, profundidad + 1, vistos);
  }
  return salida;
}

/**
 * El cuerpo listo para guardar, o `undefined` si no hay nada que guardar.
 *
 * **No toca el objeto original.** Se audita después de responder, pero el
 * cuerpo es el mismo que usó el controlador: mutarlo sería cambiar la petición
 * por el hecho de auditarla.
 */
export function limpiarParaAuditoria(
  cuerpo: unknown,
): Record<string, unknown> | undefined {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return undefined;
  }
  return limpiarValor(cuerpo, 0, new WeakSet()) as Record<string, unknown>;
}
