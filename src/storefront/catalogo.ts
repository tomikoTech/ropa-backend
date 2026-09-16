/**
 * El catálogo público: lo que un cliente ve desde el enlace de la tienda.
 *
 * La gente pidió «un catálogo, nada de página web»: ver lo que hay, armar un
 * carrito y pedir. La tienda en línea completa (cuentas, pasarela, envíos)
 * era otra app que nunca se desplegó; el catálogo vive dentro de la misma
 * app de MiPinta y lo tienen todas las tiendas.
 *
 * Acá se decide **qué sale** de un producto hacia afuera. Importa por dos
 * cosas: el costo y el precio mayorista no viajan (el endpoint público
 * anterior devolvía la entidad entera, costo incluido), y de la existencia
 * solo se dice «disponible» o «agotado», nunca cuántos quedan.
 *
 * Puro: sin base de datos; el servicio consulta y esto traduce.
 */

export interface TallaDelCatalogo {
  variantId: string;
  talla: string;
  color: string;
  /** Hay al menos un par. Nunca cuántos. */
  disponible: boolean;
  /** Solo si esa talla tiene un precio distinto al del producto. */
  precio?: number;
}

export interface ProductoDelCatalogo {
  id: string;
  slug: string;
  nombre: string;
  marca: string | null;
  genero: string | null;
  categoria: string | null;
  descripcion: string | null;
  /** Precio de venta al detal. */
  precio: number;
  fotos: string[];
  tallas: TallaDelCatalogo[];
  /** Alguna talla disponible y la referencia no está marcada agotada. */
  disponible: boolean;
}

export interface VarianteFuente {
  id: string;
  sizeName?: string | null;
  colorName?: string | null;
  isActive?: boolean;
  priceOverride?: number | null;
  stock?: number;
}

/**
 * Lo que no es para el público: la materia prima de la perfumería.
 *
 * Distri Amber tenía nueve esencias publicadas y salían en el catálogo al
 * lado de las lociones. Una esencia o un frasco son insumos —se compran, se
 * mezclan, no se venden por catálogo—, así que no salen aunque estén
 * publicados: nadie tiene que acordarse de despublicarlos.
 */
export function esParaElPublico(p: { category?: { type?: string | null } | null }): boolean {
  const tipo = (p.category?.type ?? 'STANDARD').toUpperCase();
  return tipo !== 'ESSENCE' && tipo !== 'FRASCO';
}

export interface ProductoFuente {
  id: string;
  slug: string;
  name: string;
  displayName?: string | null;
  brand?: string | null;
  gender?: string | null;
  description?: string | null;
  basePrice: number | string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  isAvailable?: boolean;
  category?: { name?: string | null; type?: string | null } | null;
  variants?: VarianteFuente[];
}

const limpio = (s?: string | null) => (s ?? '').trim() || null;

/** Orden natural de tallas: 36, 37, 38… y luego XS, S, M por texto. */
export function compararTallas(a: string, b: string): number {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a.localeCompare(b, 'es');
}

export function productoDelCatalogo(p: ProductoFuente): ProductoDelCatalogo {
  const precio = Number(p.basePrice) || 0;
  const fotos = [
    ...(p.imageUrls ?? []),
    ...(p.imageUrl ? [p.imageUrl] : []),
  ].filter((u, i, arr) => !!u && arr.indexOf(u) === i);
  const tallas = (p.variants ?? [])
    .filter((v) => v.isActive !== false)
    .map((v) => {
      const override = v.priceOverride == null ? null : Number(v.priceOverride);
      const t: TallaDelCatalogo = {
        variantId: v.id,
        talla: (v.sizeName ?? '').trim(),
        color: (v.colorName ?? '').trim(),
        disponible: Number(v.stock ?? 0) > 0,
      };
      if (override != null && override > 0 && override !== precio) t.precio = override;
      return t;
    })
    .sort((a, b) => compararTallas(a.talla, b.talla) || a.color.localeCompare(b.color, 'es'));
  return {
    id: p.id,
    slug: p.slug,
    nombre: limpio(p.displayName) ?? p.name,
    marca: limpio(p.brand),
    genero: limpio(p.gender),
    categoria: limpio(p.category?.name),
    descripcion: limpio(p.description),
    precio,
    fotos,
    tallas,
    disponible: p.isAvailable !== false && tallas.some((t) => t.disponible),
  };
}

/** Lo que se puede filtrar, sacado de lo que hay: marcas, tallas y géneros. */
export function filtrosDelCatalogo(productos: ProductoDelCatalogo[]): {
  marcas: string[];
  tallas: string[];
  generos: string[];
} {
  const marcas = new Set<string>();
  const tallas = new Set<string>();
  const generos = new Set<string>();
  for (const p of productos) {
    if (p.marca) marcas.add(p.marca);
    if (p.genero) generos.add(p.genero);
    for (const t of p.tallas) if (t.talla) tallas.add(t.talla);
  }
  return {
    marcas: [...marcas].sort((a, b) => a.localeCompare(b, 'es')),
    tallas: [...tallas].sort(compararTallas),
    generos: [...generos].sort(),
  };
}

/**
 * Lo que **no** sale por el endpoint público de la tienda en línea, aunque
 * la entidad lo traiga: costo, mayorista y precio mínimo son de la tienda.
 */
export function sinCostos<T extends object>(
  producto: T,
): Omit<T, 'costPrice' | 'wholesalePrice' | 'minimumSalePrice'> {
  const copia = { ...producto } as Record<string, unknown>;
  delete copia.costPrice;
  delete copia.wholesalePrice;
  delete copia.minimumSalePrice;
  return copia as Omit<T, 'costPrice' | 'wholesalePrice' | 'minimumSalePrice'>;
}
