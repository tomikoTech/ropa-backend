/**
 * Generación de etiquetas en ZPL (Zebra Programming Language).
 *
 * Es el formato que entienden las impresoras térmicas Zebra, que es lo que ya
 * tienen los clientes que vienen del sistema anterior. A diferencia de aquel,
 * aquí el ZPL se genera **en el servidor**: no hace falta instalar un agente
 * en cada computador.
 *
 * El resultado se puede enviar a la impresora por el puerto 9100 (red local),
 * descargar como archivo `.zpl` o copiarlo al portapapeles.
 */

export interface LabelData {
  /** Código que va en el símbolo de barras (con dígito verificador). */
  barcode: string;
  productName: string;
  /** Detalle bajo el nombre: color, talla... */
  detail?: string;
  /** Texto destacado a la derecha (precio, "CAJA x24"...). */
  highlight?: string;
}

export interface ZplOptions {
  /** Ancho en milímetros. */
  widthMm?: number;
  /** Alto en milímetros. */
  heightMm?: number;
  /** Puntos por milímetro de la impresora: 8 = 203 dpi, 12 = 300 dpi. */
  dpmm?: 8 | 12;
  /** Copias de cada etiqueta. */
  copies?: number;
}

const DEFAULTS: Required<ZplOptions> = {
  widthMm: 50,
  heightMm: 25,
  dpmm: 8,
  copies: 1,
};

/**
 * Escapa el texto para ZPL.
 *
 * `^` y `~` son los caracteres de control del lenguaje: si un nombre de
 * producto los lleva, la etiqueta sale rota o la impresora interpreta basura.
 */
export function escapeZpl(text: string): string {
  return (text || '').replace(/[\^~]/g, ' ').trim();
}

/** Recorta a lo que cabe en la etiqueta, sin cortar a mitad de palabra. */
function truncate(text: string, max: number): string {
  const clean = escapeZpl(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/** Etiqueta individual, sin los comandos de inicio/fin del lote. */
export function buildLabelZpl(
  data: LabelData,
  options: ZplOptions = {},
): string {
  const o = { ...DEFAULTS, ...options };
  const dots = (mm: number) => Math.round(mm * o.dpmm);

  const width = dots(o.widthMm);
  const margin = dots(3);
  // El código de barras ocupa el tercio inferior; el texto, la parte de arriba.
  const barcodeHeight = dots(o.heightMm * 0.38);

  const lines: string[] = [
    '^XA',
    `^PW${width}`,
    `^LL${dots(o.heightMm)}`,
    '^CI28', // UTF-8: sin esto los acentos salen mal
    `^FO${margin},${dots(2)}^A0N,${dots(3.2)},${dots(3.2)}^FD${truncate(data.productName, 26)}^FS`,
  ];

  if (data.detail) {
    lines.push(
      `^FO${margin},${dots(6)}^A0N,${dots(2.6)},${dots(2.6)}^FD${truncate(data.detail, 30)}^FS`,
    );
  }
  if (data.highlight) {
    lines.push(
      `^FO${margin},${dots(9.5)}^A0N,${dots(3.4)},${dots(3.4)}^FD${truncate(data.highlight, 20)}^FS`,
    );
  }

  lines.push(
    // Code 128: acepta los 17 dígitos del código sin las restricciones de EAN.
    `^BY2,3,${barcodeHeight}`,
    `^FO${margin},${dots(o.heightMm * 0.52)}^BCN,${barcodeHeight},Y,N,N^FD${escapeZpl(data.barcode)}^FS`,
  );

  if (o.copies > 1) lines.push(`^PQ${o.copies}`);
  lines.push('^XZ');

  return lines.join('\n');
}

/** Lote de etiquetas listo para enviar a la impresora. */
export function buildLabelBatchZpl(
  labels: LabelData[],
  options: ZplOptions = {},
): string {
  return labels.map((l) => buildLabelZpl(l, options)).join('\n');
}
