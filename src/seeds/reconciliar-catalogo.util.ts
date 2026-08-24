/**
 * Poner al día un producto que MiPinta ya tiene, contra lo que dice demachine.
 *
 * demachine es la fuente de verdad para AMAWAD y Sportcali. Pero los
 * importadores solo **creaban** productos nuevos: a uno que ya existía no le
 * agregaban las tallas que hubieran aparecido después. Por eso trece códigos
 * físicos de AMAWAD no encontraban dónde colgarse —«no existe variante para
 * talla 40 y color BLANCO»— aunque demachine tuviera esas tallas con
 * existencia y sus pares estuvieran etiquetados.
 *
 * Las dos decisiones viven acá, sin base de datos: **qué tallas faltan** y
 * **cuánto hay que mover** para que el saldo quede en lo que dice la fuente.
 */

export interface ClaveDeVariante {
  sizeId: string | null;
  colorId: string | null;
}

const clave = (v: ClaveDeVariante) => `${v.sizeId ?? ''}|${v.colorId ?? ''}`;

/**
 * Las variantes de la fuente que MiPinta todavía no tiene.
 *
 * Sin repetir: el export trae una fila por bodega, así que la misma talla
 * aparece varias veces y crearla dos veces rompe el índice único del SKU. Y en
 * el orden en que vienen, para que dos corridas hagan exactamente lo mismo.
 */
export function variantesQueFaltan<T extends ClaveDeVariante>(
  existentes: ClaveDeVariante[],
  deseadas: T[],
): T[] {
  const yaEstan = new Set(existentes.map(clave));
  const propuestas: T[] = [];
  for (const v of deseadas) {
    const k = clave(v);
    if (yaEstan.has(k)) continue;
    yaEstan.add(k);
    propuestas.push(v);
  }
  return propuestas;
}

export interface AjusteDeStock {
  variantId: string;
  warehouseId: string;
  desde: number;
  hasta: number;
  delta: number;
}

/**
 * Qué mover para que el saldo quede en lo que dice la fuente.
 *
 * Se propone la **diferencia**, no el total: escribir el total pisaría los
 * movimientos que la tienda hizo en MiPinta, y el delta deja rastro de qué se
 * movió y por qué. Lo que ya cuadra no se toca —un movimiento de cero ensucia
 * el historial con entradas que no entraron—.
 *
 * Las claves de los dos mapas son `variantId|warehouseId`.
 */
export function ajustesDeStock(
  actual: Map<string, number>,
  deseado: Map<string, number>,
): AjusteDeStock[] {
  // Lo que la fuente ya no menciona también cuenta: una talla agotada allá que
  // sigue con saldo acá es la mitad del descuadre, y si no se baja a cero las
  // dos cuentas no cuadran nunca.
  const todas = new Set([...actual.keys(), ...deseado.keys()]);
  const ajustes: AjusteDeStock[] = [];
  for (const k of [...todas].sort()) {
    const desde = actual.get(k) ?? 0;
    const hasta = deseado.get(k) ?? 0;
    if (desde === hasta) continue;
    const [variantId, warehouseId] = k.split('|');
    ajustes.push({
      variantId,
      warehouseId,
      desde,
      hasta,
      delta: hasta - desde,
    });
  }
  return ajustes;
}
