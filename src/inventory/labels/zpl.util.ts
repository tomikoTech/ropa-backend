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
 *
 * La etiqueta lleva el logo de la tienda arriba, el código de barras grande y
 * centrado en la mitad, y alrededor la mayor cantidad de información: nombre,
 * marca, referencia, si es caja o par, y el desglose legible del código.
 */

export interface LabelData {
  /** Código que va en el símbolo de barras (con dígito verificador). */
  barcode: string;
  productName: string;
  /** Detalle bajo el nombre: color, talla... */
  detail?: string;
  /** Texto destacado: "CAJA x24", "CAJA 3 · PAR 02"... */
  highlight?: string;
  /** Marca del producto. */
  brand?: string;
  /** Referencia (sku_prefix), el modelo. */
  reference?: string;
  /** Desglose legible del código: "07/08/26 · Pedido 29 · Caja 1". */
  desglose?: string;
  /** Precio ya formateado, si la tienda lo activa. */
  price?: string;
  /** Línea libre de la tienda (teléfono, aviso...). */
  extra?: string;
  /** Caja sin abrir (true) o par suelto (false). */
  isBox?: boolean;
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
  /**
   * Bloque ZPL del logo, ya renderizado (^FO…^GFA…^FS). Se inyecta en cada
   * etiqueta del lote. Si no viene, la etiqueta sale sin logo.
   */
  logoBlock?: string;
}

const DEFAULTS: Required<Omit<ZplOptions, 'logoBlock'>> = {
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
  // Solo sobrescriben los valores realmente presentes: un `widthMm: undefined`
  // que llega cuando la petición no manda medidas no debe pisar el default y
  // convertir todas las cuentas en NaN.
  const o = {
    widthMm: options.widthMm ?? DEFAULTS.widthMm,
    heightMm: options.heightMm ?? DEFAULTS.heightMm,
    dpmm: options.dpmm ?? DEFAULTS.dpmm,
    copies: options.copies ?? DEFAULTS.copies,
  };
  const dots = (mm: number) => Math.round(mm * o.dpmm);

  const width = dots(o.widthMm);
  const height = dots(o.heightMm);
  const margin = dots(2.5);
  // El logo ocupa una esquina; el texto arranca a su derecha si lo hay.
  const hasLogo = !!options.logoBlock;
  const textLeft = hasLogo ? dots(o.widthMm * 0.24) : margin;

  const lines: string[] = ['^XA', `^PW${width}`, `^LL${height}`, '^CI28'];

  if (options.logoBlock) lines.push(options.logoBlock);

  // Encabezado: nombre, y debajo marca · referencia.
  lines.push(
    `^FO${textLeft},${dots(1.5)}^A0N,${dots(3)},${dots(3)}^FB${width - textLeft - margin},1,0,L^FD${truncate(data.productName, 28)}^FS`,
  );
  const head2 = [data.brand, data.reference && `Ref ${data.reference}`]
    .filter(Boolean)
    .join('  ');
  if (head2) {
    lines.push(
      `^FO${textLeft},${dots(4.6)}^A0N,${dots(2.2)},${dots(2.2)}^FD${truncate(head2, 34)}^FS`,
    );
  }

  // Código de barras grande, centrado en la mitad. La interpretación propia
  // del ^BC va apagada (N): los dígitos se imprimen aparte, centrados, para que
  // no choquen con el pie cuando este es largo.
  const barcodeHeight = dots(o.heightMm * 0.3);
  const barcodeTop = dots(o.heightMm * 0.3);
  lines.push(
    `^BY2,3,${barcodeHeight}`,
    // FO en 0 y ^FB con el ancho total centra el símbolo horizontalmente.
    `^FO0,${barcodeTop}^BCN,${barcodeHeight},N,N,N^FB${width},1,0,C^FD${escapeZpl(data.barcode)}^FS`,
  );

  // Pie: dígitos, caja/par destacado, detalle · desglose · precio, y línea
  // libre. Todo centrado. Cada renglón se dibuja solo si cabe dentro del alto
  // del rollo; en uno de 25 mm los últimos se omiten antes que salir cortados.
  let y = o.heightMm * 0.3 + o.heightMm * 0.3 + 0.6;
  const put = (text: string, fontMm: number, max: number) => {
    if (dots(y) + dots(fontMm) > height) return; // no cabe en el rollo
    lines.push(
      `^FO0,${dots(y)}^A0N,${dots(fontMm)},${dots(fontMm)}^FB${width},1,0,C^FD${truncate(text, max)}^FS`,
    );
    y += fontMm + 0.5;
  };
  // Los dígitos: si el símbolo se raya, el operario todavía puede teclearlos.
  put(data.barcode, 2.2, 20);
  if (data.highlight) put(data.highlight, 2.7, 30);
  const pie = [data.detail, data.desglose, data.price]
    .filter(Boolean)
    .join(' · ');
  if (pie) put(pie, 2.2, 44);
  if (data.extra) put(data.extra, 2, 42);

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
