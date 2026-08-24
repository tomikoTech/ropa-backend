/**
 * Reconocer un producto de tercero que ya se vendio antes.
 *
 * Quien revende compra al detal y anota cuando vende: el mismo par vuelve a
 * pasar, y volver a escribir dueno, descripcion, talla, color, costo y precio
 * cada vez es el trabajo que hace que al final no se anote nada.
 *
 * Se escribe a mano y a la carrera, entre clientes, asi que comparar tal cual
 * llego dejaria «Nike Air», «nike  air» y «Nike Air» con tilde como tres
 * productos distintos.
 *
 * Puro: entra lo que se escribio, sale una clave.
 */
export interface ProductoDeTercero {
  thirdPartyName: string;
  productDescription: string;
  size?: string | null;
  color?: string | null;
}

/** Los diacriticos que se quitan. La enye queda fuera: si distingue palabras. */
const TILDES = /[\u0300-\u0302\u0304-\u036f]/g;

export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(TILDES, '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * El separador no se puede teclear, asi que ningun texto lo trae y mover una
 * palabra de un campo a otro no puede producir la misma clave.
 */
const SEPARADOR = '\u0001';

export function claveDeProducto(p: ProductoDeTercero): string {
  return [p.thirdPartyName, p.productDescription, p.size, p.color]
    .map(normalizar)
    .join(SEPARADOR);
}

export function mismoProducto(
  a: ProductoDeTercero,
  b: ProductoDeTercero,
): boolean {
  return claveDeProducto(a) === claveDeProducto(b);
}
