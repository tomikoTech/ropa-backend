/**
 * Aritmética de la remisión rápida: el carnet del patinador y la cuadratura de
 * lo que volvió de la calle.
 *
 * Está aparte y **puro** porque es donde se decide si la plata cuadra: es la
 * parte que hay que poder probar sin base de datos y sin ambigüedad.
 */

import { withCheckDigit } from '../inventory/barcode.util.js';

/**
 * Prefijo del carnet. Los códigos de los bultos empiezan con el año (`26…`),
 * así que un `77` al principio hace evidente, con solo mirarlo, que lo que se
 * escaneó fue un carnet y no mercancía.
 */
export const SELLER_CODE_PREFIX = '77';

/** Cuántos patinadores caben con este formato. */
export const SELLER_CODE_LIMIT = 999999;

/**
 * Código de carnet a partir del consecutivo: `77` + 6 dígitos + verificador.
 *
 * Nueve dígitos: corto para teclearlo si el carnet se borra, y con el mismo
 * dígito verificador EAN que las etiquetas, así que lo lee el lector que ya
 * tienen y una lectura mala se detecta en vez de traer al patinador equivocado.
 */
export function buildSellerCode(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('El consecutivo del carnet debe ser un entero positivo');
  }
  if (sequence > SELLER_CODE_LIMIT) {
    throw new Error(
      `Ya no caben más carnets con este formato (máximo ${SELLER_CODE_LIMIT}).`,
    );
  }
  return withCheckDigit(SELLER_CODE_PREFIX + String(sequence).padStart(6, '0'));
}

/** ¿Este código tiene forma de carnet? (antes de ir a buscarlo a la base). */
export function looksLikeSellerCode(code: string): boolean {
  return new RegExp(`^${SELLER_CODE_PREFIX}\\d{7}$`).test(code.trim());
}

// ── Conciliación ────────────────────────────────────────────────────────────

export interface DispatchedItem {
  id: string;
  productName: string;
  variantSize: string;
  variantColor: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export interface SettlementLine {
  itemId: string;
  sold: number;
  returned: number;
}

export interface SettlementSummary {
  dispatched: number;
  sold: number;
  returned: number;
  /** Lo que no volvió ni como plata ni como mercancía. */
  missing: number;
  revenue: number;
  cost: number;
  profit: number;
  /** Cuánto vale, al precio de venta, lo que falta. */
  missingValue: number;
}

/** Redondeo a pesos con dos decimales. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Revisa la conciliación antes de tocar nada y devuelve **todos** los problemas,
 * no el primero: quien está cuadrando la remisión necesita ver la lista completa
 * para corregirla de una sola vez.
 *
 * Los mensajes nombran el producto, porque "cantidad inválida en el ítem 3" no
 * le sirve a nadie parado frente al patinador.
 */
export function validateSettlement(
  items: DispatchedItem[],
  lines: SettlementLine[],
): string[] {
  const errors: string[] = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();

  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) {
      errors.push(`Hay un renglón que no pertenece a esta remisión.`);
      continue;
    }
    if (seen.has(line.itemId)) {
      errors.push(
        `"${describe(item)}" viene dos veces en la conciliación; déjalo una sola.`,
      );
      continue;
    }
    seen.add(line.itemId);

    if (!Number.isInteger(line.sold) || line.sold < 0) {
      errors.push(`"${describe(item)}": lo vendido no puede ser negativo.`);
    }
    if (!Number.isInteger(line.returned) || line.returned < 0) {
      errors.push(`"${describe(item)}": lo devuelto no puede ser negativo.`);
    }
    const total = (line.sold || 0) + (line.returned || 0);
    if (total > item.quantity) {
      errors.push(
        `"${describe(item)}": entre vendido (${line.sold}) y devuelto ` +
          `(${line.returned}) suman ${total}, y solo se despacharon ` +
          `${item.quantity}.`,
      );
    }
  }

  const faltantes = items.filter((i) => !seen.has(i.id));
  if (faltantes.length) {
    errors.push(
      `Falta cuadrar ${faltantes.length} renglón(es): ` +
        faltantes.map(describe).join(', ') +
        `. Si no volvieron, escribe 0 y 0 para que quede el faltante registrado.`,
    );
  }

  return errors;
}

function describe(item: DispatchedItem): string {
  const talla = [item.variantSize, item.variantColor].filter(Boolean).join('/');
  return talla ? `${item.productName} ${talla}` : item.productName;
}

/**
 * Cuánto se despachó, cuánto volvió y cuánto se dejó de ver.
 *
 * Sirve para la remisión abierta (usando lo ya registrado) y para la
 * conciliación que se está a punto de guardar (pasándole las líneas).
 */
export function settlementSummary(
  items: (DispatchedItem & {
    quantitySold?: number;
    quantityReturned?: number;
  })[],
  lines?: SettlementLine[],
): SettlementSummary {
  const byId = new Map((lines ?? []).map((l) => [l.itemId, l]));

  let dispatched = 0;
  let sold = 0;
  let returned = 0;
  let revenue = 0;
  let cost = 0;
  let missingValue = 0;

  for (const item of items) {
    const line = byId.get(item.id);
    const vendido = line ? line.sold : (item.quantitySold ?? 0);
    const devuelto = line ? line.returned : (item.quantityReturned ?? 0);
    const falta = Math.max(0, item.quantity - vendido - devuelto);

    dispatched += item.quantity;
    sold += vendido;
    returned += devuelto;
    revenue += vendido * item.unitPrice;
    // El costo de lo vendido: lo devuelto vuelve al inventario y lo que falta
    // se mira aparte, para que la utilidad de la calle no lo absorba en silencio.
    cost += vendido * item.unitCost;
    missingValue += falta * item.unitPrice;
  }

  return {
    dispatched,
    sold,
    returned,
    missing: dispatched - sold - returned,
    revenue: money(revenue),
    cost: money(cost),
    profit: money(revenue - cost),
    missingValue: money(missingValue),
  };
}
