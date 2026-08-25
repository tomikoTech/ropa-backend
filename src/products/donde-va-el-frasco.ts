/**
 * Dónde nace el frasco que se crea solo junto a una loción.
 *
 * En una perfumería, crear una loción crea también su frasco: un producto
 * aparte, en la categoría de frascos, con existencias en cero. La pregunta
 * —cuál es «la categoría de frascos»— parecía trivial y por eso estaba
 * resuelta con `LOWER(name) = 'frascos'`.
 *
 * Eso se rompe en silencio. La tienda que llame «Envases» a su categoría deja
 * de tener frascos automáticos y nadie se entera: la loción se crea igual y el
 * frasco no aparece nunca. Y las categorías **ya tienen un tipo**
 * (`STANDARD | ESSENCE | FRASCO`), que es el dato que de verdad dice qué es
 * cada una; el nombre es como la tienda decidió llamarla ese día.
 *
 * Así que primero el tipo, y el nombre solo como último recurso —para las
 * tiendas viejas cuya categoría se creó antes de que existiera el tipo—.
 */
export interface CategoriaPosible {
  id: string;
  name: string;
  type?: string | null;
}

export interface BodegaPosible {
  id: string;
  name: string;
  isActive?: boolean;
}

const ES_FRASCO = 'FRASCO';

/** Quita tildes y mayúsculas: «Frascos» y «FRASCOS» son la misma. */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * La categoría donde va el frasco, o `null` si la tienda no tiene ninguna.
 *
 * Con varias del tipo correcto se queda con la primera: son equivalentes para
 * esto, y elegir «la que se llame frascos» entre ellas sería volver al
 * problema de arriba por otra puerta.
 */
export function categoriaDelFrasco(
  categorias: CategoriaPosible[],
): CategoriaPosible | null {
  const porTipo = categorias.find((c) => c.type === ES_FRASCO);
  if (porTipo) return porTipo;
  return categorias.find((c) => normalizar(c.name) === 'frascos') ?? null;
}

/**
 * La bodega donde nace en cero, o `null`.
 *
 * Acá no hay tipo que valga: una bodega es un sitio y solo tiene nombre. Si no
 * existe, el frasco se crea igual y sin fila de existencias —que es lo
 * correcto: la fila en cero es una comodidad para que aparezca en los
 * listados, no un requisito.
 */
export function bodegaDelFrasco(
  bodegas: BodegaPosible[],
): BodegaPosible | null {
  const candidatas = bodegas.filter(
    (b) => normalizar(b.name) === 'frascos' && b.isActive !== false,
  );
  return candidatas[0] ?? null;
}
