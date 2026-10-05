/**
 * Qué puede salir en la tienda online.
 *
 * Un frasco vacío y un tarro de esencia son insumos, no productos: Andrea
 * abrió su catálogo y vio «Frasco ESTUCHE LACOSTE… $0» entre los perfumes
 * porque alguien marcó el globo de publicar en un frasco. En perfumería el
 * catálogo público solo enseña terminados, y publicar un insumo se rechaza
 * en vez de dejarlo pasar en silencio.
 */
export type TipoDeCategoria = 'STANDARD' | 'ESSENCE' | 'FRASCO' | null | undefined;

export const TIPOS_QUE_NO_SE_VENDEN = ['ESSENCE', 'FRASCO'] as const;

export function seVendeEnLinea(tipo: TipoDeCategoria): boolean {
  return !tipo || tipo === 'STANDARD';
}

/** Mensaje de rechazo al publicar, o null si se puede. */
export function porQueNoSePublica(tipo: TipoDeCategoria): string | null {
  if (seVendeEnLinea(tipo)) return null;
  return tipo === 'FRASCO'
    ? 'Los frascos son insumos: no se publican en la tienda online.'
    : 'Las esencias son insumos: no se publican en la tienda online.';
}

/** Condición SQL para las consultas del catálogo (alias de la categoría). */
export function condicionDeVentaEnLinea(aliasCategoria: string): string {
  return `(${aliasCategoria}.type IS NULL OR ${aliasCategoria}.type = 'STANDARD')`;
}
