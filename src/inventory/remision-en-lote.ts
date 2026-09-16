/**
 * Una remisión con varios renglones.
 *
 * AMAWAD mandaba mercancía a LOCAL 214 y el traslado era de **una** talla por
 * vez: tres cajas y cinco pares eran ocho remisiones, ocho números, ocho
 * papeles. La cesión sí agrupaba; el traslado no.
 *
 * Cada renglón sigue siendo una fila de `stock_transfers` —recibir, rechazar y
 * devolver funcionan por renglón, y eso es útil: se devuelven dos pares de los
 * ocho—. Lo que los ata es el `lote_id` y el número: la remisión es
 * «TR-00042» y sus renglones «TR-00042-1», «TR-00042-2»… Una remisión de un
 * solo renglón se numera como siempre, sin sufijo.
 *
 * Puro: acá viven la numeración y la validación de lo que no se puede mandar
 * dos veces; el servicio hace la transacción.
 */

/** Los números de los renglones de una remisión que empieza en `base`. */
export function numerosDeLosRenglones(base: string, cuantos: number): string[] {
  if (cuantos <= 1) return [base];
  return Array.from({ length: cuantos }, (_, i) => `${base}-${i + 1}`);
}

/** «TR-00042-3» → «TR-00042». Sin sufijo, el mismo número. */
export function numeroDeLaRemision(numero: string | null | undefined): string | null {
  if (!numero) return null;
  const m = /^(TR-\d+)(?:-\d+)?$/.exec(numero.trim());
  return m ? m[1] : numero;
}

export interface RenglonDeRemision {
  variantId: string;
  quantity: number;
  stockUnitId?: string | null;
}

/**
 * Qué renglones no pueden ir juntos: el mismo bulto dos veces.
 *
 * Escanear la misma caja dos veces es lo más fácil del mundo con el lector
 * en la mano. Dos renglones de la misma talla sin bulto sí pueden ir: son
 * «N pares» y «M pares» del mismo modelo, y el ledger elige cuáles.
 */
export function bultosRepetidos(renglones: RenglonDeRemision[]): string[] {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const r of renglones) {
    if (!r.stockUnitId) continue;
    if (vistos.has(r.stockUnitId)) repetidos.add(r.stockUnitId);
    vistos.add(r.stockUnitId);
  }
  return [...repetidos];
}

/** Cuántos pares viajan en total. */
export function paresDeLaRemision(renglones: RenglonDeRemision[]): number {
  return renglones.reduce((t, r) => t + Number(r.quantity || 0), 0);
}
