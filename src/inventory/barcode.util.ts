/**
 * Códigos de barras del inventario por unidades.
 *
 * Formato (16 dígitos), heredado del sistema anterior para que los lectores y
 * las plantillas de etiqueta que el cliente ya tiene sigan sirviendo:
 *
 *     2 6 0 8 0 7 | 0 0 2 9 | 0 0 1 | 0 0 1
 *     └── fecha ──┘ └ orden ┘ └ ren ┘ └ sec ┘
 *      AA MM DD      (4)       (3)     (3)
 *
 * - **fecha**: día en que entró la mercancía (permite ubicar el lote a ojo).
 * - **orden**: consecutivo de la orden de compra.
 * - **renglón**: consecutivo del renglón dentro de la orden.
 * - **secuencia**: número del bulto dentro del renglón.
 *
 * El **dígito verificador** se calcula aparte con el algoritmo EAN, que es el
 * que usan los lectores para descartar lecturas mal hechas.
 */

/** Máximos que caben en cada tramo antes de desbordar el formato. */
export const BARCODE_LIMITS = {
  order: 9999,
  line: 999,
  unit: 999,
} as const;

export interface StockBarcodeParts {
  /** Fecha de entrada. Solo se usan año (2 dígitos), mes y día. */
  date: Date;
  /** Consecutivo de la orden de compra. */
  orderSequence: number;
  /** Consecutivo del renglón dentro de la orden. */
  lineConsecutive: number;
  /** Número del bulto dentro del renglón (1, 2, 3...). */
  unitSequence: number;
}

function pad(value: number, length: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(length, '0');
}

/**
 * Dígito verificador EAN: se suman las posiciones alternando peso 1 y 3, y el
 * dígito es lo que falta para llegar a la siguiente decena.
 */
export function calculateCheckDigit(digits: string): number {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < digits.length; i++) {
    const n = Number(digits.charAt(i));
    if (Number.isNaN(n)) continue;
    if (i % 2 === 0) odd += n;
    else even += n;
  }
  return (10 - ((odd + even * 3) % 10)) % 10;
}

/** Comprueba un código que ya trae su dígito verificador al final. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{2,}$/.test(code)) return false;
  const body = code.slice(0, -1);
  const check = Number(code.slice(-1));
  return calculateCheckDigit(body) === check;
}

/**
 * Construye el código de un bulto. Devuelve el cuerpo de 16 dígitos; para
 * imprimirlo con verificador usar `withCheckDigit`.
 */
export function buildStockBarcode(parts: StockBarcodeParts): string {
  const { date, orderSequence, lineConsecutive, unitSequence } = parts;

  if (orderSequence > BARCODE_LIMITS.order) {
    throw new Error(
      `El consecutivo de orden ${orderSequence} no cabe en el código de barras (máx. ${BARCODE_LIMITS.order}).`,
    );
  }
  if (lineConsecutive > BARCODE_LIMITS.line) {
    throw new Error(
      `El consecutivo de renglón ${lineConsecutive} no cabe en el código de barras (máx. ${BARCODE_LIMITS.line}).`,
    );
  }
  if (unitSequence > BARCODE_LIMITS.unit) {
    throw new Error(
      `La secuencia de bulto ${unitSequence} no cabe en el código de barras (máx. ${BARCODE_LIMITS.unit}).`,
    );
  }

  const yy = pad(date.getFullYear() % 100, 2);
  const mm = pad(date.getMonth() + 1, 2);
  const dd = pad(date.getDate(), 2);

  return (
    `${yy}${mm}${dd}` +
    pad(orderSequence, 4) +
    pad(lineConsecutive, 3) +
    pad(unitSequence, 3)
  );
}

/** Añade el dígito verificador al final (lo que se imprime en la etiqueta). */
export function withCheckDigit(body: string): string {
  return body + String(calculateCheckDigit(body));
}

/** Lee la información codificada en un código de barras del inventario. */
export function parseStockBarcode(code: string): {
  year: number;
  month: number;
  day: number;
  orderSequence: number;
  lineConsecutive: number;
  unitSequence: number;
} | null {
  const body = code.length === 17 ? code.slice(0, 16) : code;
  if (!/^\d{16}$/.test(body)) return null;
  return {
    year: 2000 + Number(body.slice(0, 2)),
    month: Number(body.slice(2, 4)),
    day: Number(body.slice(4, 6)),
    orderSequence: Number(body.slice(6, 10)),
    lineConsecutive: Number(body.slice(10, 13)),
    unitSequence: Number(body.slice(13, 16)),
  };
}
