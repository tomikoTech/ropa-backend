/**
 * Lo que el cliente manda por WhatsApp, leído sin adivinar.
 *
 * Una tienda nueva no llega con un archivo: llega con un mensaje que dice
 * «30 Carrieles / 33 conjuntos cortos / 172 gorras». Transcribir eso a mano es
 * donde se cuela el error que después nadie encuentra —un cero de más en una
 * cantidad, un producto que se salta—, y el mensaje trae basura del propio
 * WhatsApp: `[5:39 p. m., 25/8/2026] Andres: 4 boxer`.
 *
 * Así que se lee el mensaje **tal como llegó**, y lo que no se entienda se
 * devuelve aparte en vez de inventarse. Un renglón que este archivo no sepa
 * leer sale en `ilegibles` y el seed se niega a cargar hasta que alguien lo
 * mire: cargar 17 de 18 productos en silencio es peor que no cargar ninguno.
 */
export interface Renglon {
  /** Cuántas unidades. Entero positivo. */
  cantidad: number;
  /** La sección bajo la que venía, o `null` si la lista no traía secciones. */
  categoria: string | null;
  /** El nombre ya listo para el catálogo: en singular y con mayúsculas. */
  nombre: string;
  /** El renglón como venía, para poder cruzarlo con el mensaje original. */
  crudo: string;
}

export interface Lectura {
  renglones: Renglon[];
  /** Los renglones que no se entendieron, sin tocar. */
  ilegibles: string[];
}

/** El sello que WhatsApp le pone a cada línea cuando se copia una conversación. */
const SELLO_DE_WHATSAPP = /^\[[^\]]*\]\s*/;
/** «Andres Ropa Elite Canario: » — quien lo escribió. Sin dígitos, para no
 *  confundirlo con un producto que llevara dos puntos. */
const QUIEN_LO_ESCRIBIO = /^[^:\d]{1,60}:\s*/;

const CANTIDAD_Y_NOMBRE = /^(\d+)\s+(.+)$/;

/**
 * Palabras que en español no se capitalizan en mitad de un nombre.
 * «Polo de Hombre», no «Polo De Hombre».
 */
const CONECTORES = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u',
  'con', 'sin', 'para', 'a', 'al', 'en', 'por',
]);

/**
 * De plural a singular, con las tres terminaciones que de verdad aparecen.
 *
 * No es un lematizador y no pretende serlo: no sabe de excepciones («inglés»
 * no es el plural de nada) ni de plurales invariables. Cubre lo que manda una
 * tienda de ropa, y lo que no acierte se corrige renombrando el producto, que
 * es un campo de texto.
 */
export function enSingular(palabra: string): string {
  // Las palabras muy cortas que acaban en s casi nunca son plurales («de»,
  // «los», «mes»), y equivocarse ahí deja un nombre roto.
  if (palabra.length <= 3) return palabra;
  if (!/s$/i.test(palabra)) return palabra;
  // pantalones → pantalón, lociones → loción. La tilde vuelve donde estaba.
  if (/ones$/i.test(palabra)) return palabra.slice(0, -4) + 'ón';
  // lápices → lápiz.
  if (/ces$/i.test(palabra)) return palabra.slice(0, -3) + 'z';
  // carrieles → carriel.
  if (/es$/i.test(palabra)) return palabra.slice(0, -2);
  // gorras → gorra.
  return palabra.slice(0, -1);
}

/**
 * El nombre como va a quedar en el catálogo: en singular y capitalizado.
 *
 * Singular porque en el mostrador se vende **una** camiseta, y porque un
 * catálogo que mezcla «Gorra» con «Camisetas» se ve descuidado desde la
 * primera pantalla.
 */
export function nombreDeProducto(crudo: string): string {
  const palabras = crudo.trim().split(/\s+/).filter(Boolean);
  return palabras
    .map((p) => enSingular(p.toLowerCase()))
    .map((p, i) =>
      i > 0 && CONECTORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(' ');
}

/**
 * Una línea que abre sección: `# Camisetas`.
 *
 * El cliente manda una lista plana y las categorías las pone quien carga. Que
 * vayan en el mismo archivo —y no en una tabla aparte del código— es lo que
 * hace que se pueda revisar la carga leyendo un archivo en vez de dos.
 */
export function leerSeccion(linea: string): string | null {
  const m = /^#+\s*(.+?)\s*$/.exec(linea.trim());
  return m ? m[1] : null;
}

/**
 * Cualquier línea que empiece por almohadilla.
 *
 * Una que trae nombre abre sección; una vacía —el renglón en blanco de un
 * bloque de comentario— no abre nada **y tampoco es un error**. Sin esta
 * distinción, el encabezado explicativo del archivo tumbaba la carga entera.
 */
export function esComentario(linea: string): boolean {
  return linea.trim().startsWith('#');
}

/** Un renglón suelto, o `null` si no se entendió. */
export function leerRenglon(
  linea: string,
  categoria: string | null = null,
): Renglon | null {
  const limpia = linea
    .trim()
    .replace(SELLO_DE_WHATSAPP, '')
    .replace(QUIEN_LO_ESCRIBIO, '')
    .trim();

  const m = CANTIDAD_Y_NOMBRE.exec(limpia);
  if (!m) return null;

  const cantidad = Number(m[1]);
  // Cero unidades no es un renglón de inventario: es un producto que no está.
  if (!Number.isInteger(cantidad) || cantidad <= 0) return null;

  const nombre = nombreDeProducto(m[2]);
  if (!nombre) return null;

  return { cantidad, nombre, categoria, crudo: limpia };
}

/** El mensaje entero. Las líneas vacías no cuentan como ilegibles. */
export function leerLista(texto: string): Lectura {
  const renglones: Renglon[] = [];
  const ilegibles: string[] = [];

  let seccion: string | null = null;
  for (const linea of texto.split('\n')) {
    if (!linea.trim()) continue;
    if (esComentario(linea)) {
      const abre = leerSeccion(linea);
      if (abre) seccion = abre;
      continue;
    }
    const renglon = leerRenglon(linea, seccion);
    if (renglon) renglones.push(renglon);
    else ilegibles.push(linea.trim());
  }

  return { renglones, ilegibles };
}

/**
 * Para quién es la prenda, según cómo la nombró la tienda.
 *
 * Solo cuando el nombre lo dice: «Camiseta Dama» es de mujer y «Polo de
 * Hombre» es de hombre porque así lo escribieron, no porque alguien lo haya
 * supuesto. Todo lo demás queda unisex, que es lo que se puede afirmar.
 *
 * Deliberadamente **no** adivina por el tipo de prenda —un bóxer o una blusa
 * no traen el dato en el nombre—: eso lo corrige la tienda en un desplegable,
 * y equivocarse ahí le esconde productos a media clientela.
 */
export function generoPorElNombre(nombre: string): 'HOMBRE' | 'MUJER' | 'UNISEX' {
  const limpio = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const tiene = (...palabras: string[]) =>
    palabras.some((p) => new RegExp(`\\b${p}\\b`).test(limpio));

  if (tiene('dama', 'damas', 'mujer', 'mujeres', 'nina', 'ninas')) return 'MUJER';
  if (tiene('hombre', 'hombres', 'caballero', 'caballeros', 'nino', 'ninos'))
    return 'HOMBRE';
  return 'UNISEX';
}
