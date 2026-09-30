/**
 * El nombre de usuario y la contraseña: qué se acepta y qué no.
 *
 * La tienda entra con **usuario**, no con correo: «permitamos el login con
 * usernames… y que se puedan cambiar en la configuración sin problema». En el
 * mostrador nadie teclea `vendedor-amawad@gmail.com` veinte veces al día, y
 * varias de las personas que venden no tienen correo propio.
 *
 * Las reglas viven aparte del servicio porque deciden quién entra y quién no,
 * y eso hay que probarlo entero. Son pocas y todas tienen su porqué:
 *
 *  - Se guarda **en minúsculas y sin espacios**: quien lo escribe en el
 *    celular con mayúscula automática tiene que poder entrar igual.
 *  - **Sin arroba**: el mismo campo del login acepta correo o usuario, así
 *    que un usuario con `@` sería imposible de distinguir de un correo.
 *  - Nada de tildes ni eñes: se dicta por teléfono y se escribe con prisa.
 */

/** Lo que se guarda, a partir de lo que la gente escribe. */
export function normalizarUsuario(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    // Se quitan las tildes en vez de rechazar la palabra: «josé» entra como
    // «jose», que es lo que la persona iba a teclear de todos modos.
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export const LARGO_MINIMO_DEL_USUARIO = 3;
export const LARGO_MAXIMO_DEL_USUARIO = 30;
export const LARGO_MINIMO_DE_LA_CLAVE = 6;

/**
 * Por qué no sirve ese usuario, en palabras de mostrador. `null` = sirve.
 *
 * Devuelve el motivo y no un booleano: quien lo está escribiendo necesita
 * saber qué corregir, no que «no es válido».
 */
export function porQueNoSirveElUsuario(texto: string): string | null {
  const u = normalizarUsuario(texto);
  if (!u) return 'Escribe un nombre de usuario.';
  if (u.includes('@')) {
    return 'El usuario no lleva arroba: eso es un correo.';
  }
  if (u.length < LARGO_MINIMO_DEL_USUARIO) {
    return `El usuario necesita al menos ${LARGO_MINIMO_DEL_USUARIO} letras.`;
  }
  if (u.length > LARGO_MAXIMO_DEL_USUARIO) {
    return `El usuario no puede pasar de ${LARGO_MAXIMO_DEL_USUARIO} letras.`;
  }
  if (!/^[a-z0-9._-]+$/.test(u)) {
    return 'El usuario solo lleva letras, números, punto, guion y guion bajo.';
  }
  return null;
}

/**
 * Por qué no sirve esa contraseña. `null` = sirve.
 *
 * El mínimo es el mismo que ya exigía el alta de usuarios (6): subirlo acá
 * dejaría a media tienda sin poder cambiar la suya por una que el
 * administrador sí puede ponerle.
 */
export function porQueNoSirveLaClave(
  nueva: string,
  contexto: { actual?: string; usuario?: string } = {},
): string | null {
  const clave = nueva ?? '';
  if (!clave) return 'Escribe la contraseña nueva.';
  if (clave.length < LARGO_MINIMO_DE_LA_CLAVE) {
    return `La contraseña necesita al menos ${LARGO_MINIMO_DE_LA_CLAVE} caracteres.`;
  }
  if (contexto.actual && clave === contexto.actual) {
    return 'La contraseña nueva es igual a la de ahora.';
  }
  if (
    contexto.usuario &&
    clave.toLowerCase() === normalizarUsuario(contexto.usuario)
  ) {
    // No es una política de seguridad de manual: es que pasa, y deja la
    // cuenta abierta para cualquiera que vea el usuario en la pantalla.
    return 'La contraseña no puede ser igual al usuario.';
  }
  return null;
}
