/**
 * Qué puede salir en la tienda online.
 *
 * Un frasco vacío y un tarro de esencia son insumos, no productos: Andrea
 * abrió su catálogo y vio «Frasco ESTUCHE LACOSTE… $0» entre los perfumes
 * porque alguien marcó el globo de publicar en un frasco. En perfumería el
 * catálogo público solo enseña terminados, y publicar un insumo se rechaza
 * en vez de dejarlo pasar en silencio.
 *
 * Y sin precio tampoco: «Estuche Yara sale en 0 pesos» (Andrea, 6 oct 2026)
 * era un producto nuevo publicado antes de ponerle precio, y entró a un
 * pedido en $0. Hay que ponerle precio antes de publicarlo.
 */
export type TipoDeCategoria =
  | 'STANDARD'
  | 'ESSENCE'
  | 'FRASCO'
  | null
  | undefined;

export const TIPOS_QUE_NO_SE_VENDEN = ['ESSENCE', 'FRASCO'] as const;

export function esTipoVendible(tipo: TipoDeCategoria): boolean {
  return !tipo || tipo === 'STANDARD';
}

/** Con precio: el del producto, o alguna variante con precio propio. */
export function tienePrecio(
  precio: number | string | null | undefined,
  preciosDeVariantes: (number | string | null | undefined)[] = [],
): boolean {
  const n = Number(precio) || 0;
  if (n > 0) return true;
  return preciosDeVariantes.some((v) => (Number(v) || 0) > 0);
}

/** Terminado y con precio: eso es lo que sale en la tienda online. */
export function seVendeEnLinea(
  tipo: TipoDeCategoria,
  precio?: number | string | null,
  preciosDeVariantes?: (number | string | null | undefined)[],
): boolean {
  if (!esTipoVendible(tipo)) return false;
  if (precio === undefined) return true;
  return tienePrecio(precio, preciosDeVariantes);
}

/** Mensaje de rechazo al publicar, o null si se puede. */
export function porQueNoSePublica(
  tipo: TipoDeCategoria,
  precio?: number | string | null,
  preciosDeVariantes?: (number | string | null | undefined)[],
): string | null {
  if (!esTipoVendible(tipo))
    return tipo === 'FRASCO'
      ? 'Los frascos son insumos: no se publican en la tienda online.'
      : 'Las esencias son insumos: no se publican en la tienda online.';
  if (precio !== undefined && !tienePrecio(precio, preciosDeVariantes))
    return 'Ponle precio antes de publicarlo.';
  return null;
}

/** Condición SQL para las consultas del catálogo (alias de la categoría). */
export function condicionDeVentaEnLinea(aliasCategoria: string): string {
  return `(${aliasCategoria}.type IS NULL OR ${aliasCategoria}.type = 'STANDARD')`;
}
