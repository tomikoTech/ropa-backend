/**
 * Cómo se nombra el contenido de una caja.
 *
 * Una caja no tiene talla: trae un surtido. Pero la línea de venta necesita
 * un texto corto para la columna «Talla», y hasta ahora ahí se copiaba la
 * talla de la **variante equivalente** —la primera del producto—, así que una
 * caja surtida 36-39 quedaba registrada como «talla 36». El detalle completo
 * viaja aparte, en `box_contents`.
 */

export interface BoxContentLine {
  size: string;
  quantity: number;
}

/** Ordena tallas como las lee una persona: 9 antes que 36, no después. */
export function sortSizes(contents: BoxContentLine[]): BoxContentLine[] {
  return [...contents].sort((a, b) =>
    a.size.localeCompare(b.size, 'es', { numeric: true }),
  );
}

/**
 * El texto corto que va donde antes iba una talla falsa.
 *
 * Con dos tallas o más dice el rango («Surtido 36-39»), que es como se habla
 * de una caja en la bodega. Con una sola talla lo dice tal cual, porque
 * entonces sí hay una talla que es verdad.
 */
export function describeBoxSizes(contents: BoxContentLine[]): string {
  const conPares = sortSizes(contents.filter((row) => row.quantity > 0));
  if (conPares.length === 0) return 'Tallas mixtas';
  if (conPares.length === 1) return `Talla ${conPares[0].size}`;
  const primera = conPares[0].size;
  const ultima = conPares[conPares.length - 1].size;
  return `Surtido ${primera}-${ultima}`;
}

/** El desglose completo: «36×6 · 37×6 · 38×6». */
export function describeBoxContents(contents: BoxContentLine[]): string {
  return sortSizes(contents.filter((row) => row.quantity > 0))
    .map((row) => `${row.size}×${row.quantity}`)
    .join(' · ');
}

/** Cuántos pares trae en total, según el detalle. */
export function totalPairs(contents: BoxContentLine[]): number {
  return contents.reduce((suma, row) => suma + Number(row.quantity || 0), 0);
}
