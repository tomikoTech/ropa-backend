/**
 * La factura, en PDF.
 *
 * Nació para mandarla por WhatsApp. Lo que se mandaba era **el texto** de la
 * factura —cada renglón, cada talla, cada precio— y con diez productos el
 * mensaje era una pared que nadie leía. WhatsApp no deja adjuntar un archivo
 * desde un enlace, así que el camino es: el PDF se genera acá, se aloja en R2
 * y el mensaje lleva **el enlace**, corto.
 *
 * Es la misma factura que se imprime en el mostrador (`invoice-print.ts` en el
 * frontend): mismo encabezado, misma tabla, mismas notas. Si un día difieren,
 * el cliente recibe por WhatsApp una factura distinta a la que le dieron en
 * papel, y eso es una llamada de reclamo.
 *
 * Todo el dibujo es una función pura de sus datos: no toca la base ni la red.
 * Traer el logo es cosa de quien llama.
 */
import PDFDocument from 'pdfkit';

export interface DatosDeLaTienda {
  nombre: string;
  /** El logo ya descargado. Sin logo, el encabezado es solo texto. */
  logo?: Buffer | null;
  direccion?: string | null;
  ciudad?: string | null;
  whatsapp?: string | null;
  /** «Calzado al por mayor», la frase bajo el nombre. */
  lema?: string | null;
  /** «Garantía de 30 días…», siempre al pie. */
  notaAlPie?: string | null;
  /** Solo si hay saldo: «Pague antes del…». */
  notaDeVencimiento?: string | null;
  /** «¡Gracias por su compra!». */
  agradecimiento?: string | null;
  /** Si la factura muestra el código de cada renglón. */
  muestraCodigos: boolean;
}

export interface RenglonDeFactura {
  nombre: string;
  /** «38 / Negro». */
  detalle?: string | null;
  codigo?: string | null;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

export interface DatosDeFactura {
  numero: string;
  fecha: string;
  vence?: string | null;
  cliente: string;
  documento?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  renglones: RenglonDeFactura[];
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
  pagado: number;
  saldo: number;
  notas?: string | null;
}

/** «$ 195.000»: sin código de moneda, punto de miles, sin centavos. */
export const plata = (n: number): string =>
  '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(Number(n) || 0));

const fecha = (iso: string): string => {
  // Solo el día, en palabras cortas: «12 sep 2026». Sin `new Date(iso)` a
  // secas para un `date` puro, que en Colombia retrocede un día.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(d);
};

const MARGEN = 40;
const ANCHO_CARTA = 612;
const ANCHO_UTIL = ANCHO_CARTA - MARGEN * 2;

export function pdfDeFactura(
  tienda: DatosDeLaTienda,
  factura: DatosDeFactura,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGEN,
      info: { Title: `Factura ${factura.numero}`, Author: tienda.nombre },
    });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    // ── Encabezado: logo a la izquierda, tienda a la derecha ──────────────
    let y = MARGEN;
    if (tienda.logo) {
      try {
        doc.image(tienda.logo, MARGEN, y, { fit: [110, 60] });
      } catch {
        // Un logo que pdfkit no entiende (SVG, WebP) no puede tumbar la
        // factura: sale sin logo, que es lo que había antes.
      }
    }
    const xTienda = MARGEN + (tienda.logo ? 125 : 0);
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(tienda.nombre, xTienda, y, { width: ANCHO_UTIL - (xTienda - MARGEN) });
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    if (tienda.lema) doc.text(tienda.lema);
    const contacto = [tienda.direccion, tienda.ciudad].filter(Boolean).join(' · ');
    if (contacto) doc.text(contacto);
    if (tienda.whatsapp) doc.text(`WhatsApp: ${tienda.whatsapp}`);
    doc.fillColor('#000');
    y = Math.max(doc.y, y + (tienda.logo ? 60 : 0)) + 14;

    // ── Número y fechas ──────────────────────────────────────────────────
    doc.moveTo(MARGEN, y).lineTo(ANCHO_CARTA - MARGEN, y).strokeColor('#bbb').stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(13).text(`Factura ${factura.numero}`, MARGEN, y);
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    doc.text(`Fecha: ${fecha(factura.fecha)}`, ANCHO_CARTA - MARGEN - 200, y, {
      width: 200,
      align: 'right',
    });
    if (factura.vence) {
      doc.text(`Vence: ${fecha(factura.vence)}`, ANCHO_CARTA - MARGEN - 200, y + 12, {
        width: 200,
        align: 'right',
      });
    }
    doc.fillColor('#000');
    y += 30;

    // ── Cliente ──────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).text('CLIENTE', MARGEN, y);
    doc.font('Helvetica').fontSize(10).text(factura.cliente, MARGEN, y + 12);
    doc.fontSize(9).fillColor('#444');
    const datosCliente = [
      factura.documento ? `Doc. ${factura.documento}` : null,
      factura.telefono,
      factura.direccion,
    ].filter(Boolean);
    if (datosCliente.length) doc.text(datosCliente.join(' · '));
    doc.fillColor('#000');
    y = doc.y + 14;

    // ── Tabla de renglones ───────────────────────────────────────────────
    const col = { nombre: MARGEN, cant: 400, unit: 450, total: 520 };
    const filaEncabezado = (yy: number) => {
      doc.rect(MARGEN, yy - 3, ANCHO_UTIL, 16).fill('#f0f0f0').fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Producto', col.nombre + 4, yy);
      doc.text('Cant.', col.cant, yy, { width: 40, align: 'right' });
      doc.text('Unitario', col.unit, yy, { width: 60, align: 'right' });
      doc.text('Total', col.total, yy, { width: 52, align: 'right' });
      return yy + 18;
    };
    y = filaEncabezado(y);
    doc.font('Helvetica').fontSize(9);

    for (const r of factura.renglones) {
      // Salto de página con el encabezado repetido: una factura de sesenta
      // renglones no cabe en una hoja, y sin encabezado la segunda página es
      // una lista de números sin columnas.
      if (y > 700) {
        doc.addPage();
        y = filaEncabezado(MARGEN);
        doc.font('Helvetica').fontSize(9);
      }
      const detalle = [r.detalle, tienda.muestraCodigos && r.codigo ? r.codigo : null]
        .filter(Boolean)
        .join(' · ');
      doc.fillColor('#000').text(r.nombre, col.nombre + 4, y, { width: 340 });
      if (detalle) {
        doc.fontSize(7.5).fillColor('#666').text(detalle, col.nombre + 4, doc.y, { width: 340 });
        doc.fontSize(9).fillColor('#000');
      }
      // El alto del renglón lo manda la columna del nombre, que es la única
      // que puede ocupar dos líneas. Se toma ANTES de escribir los números:
      // cada `text()` de una línea deja `doc.y` en su propia línea, y leerlo
      // después daba un alto de una sola, con la divisoria tachando el detalle.
      const yFinal = doc.y;
      doc.text(String(r.cantidad), col.cant, y, { width: 40, align: 'right' });
      doc.text(plata(r.precioUnitario), col.unit, y, { width: 60, align: 'right' });
      doc.text(plata(r.total), col.total, y, { width: 52, align: 'right' });
      y = Math.max(yFinal, y + 12) + 4;
      doc.moveTo(MARGEN, y - 2).lineTo(ANCHO_CARTA - MARGEN, y - 2).strokeColor('#eee').stroke();
    }

    // ── Totales ──────────────────────────────────────────────────────────
    y += 6;
    const linea = (rotulo: string, valor: string, negrita = false, color = '#000') => {
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(negrita ? 11 : 9).fillColor(color);
      doc.text(rotulo, 380, y, { width: 120, align: 'right' });
      doc.text(valor, 505, y, { width: 67, align: 'right' });
      y += negrita ? 16 : 13;
      doc.fillColor('#000');
    };
    if (factura.descuento > 0 || factura.iva > 0) {
      linea('Subtotal', plata(factura.subtotal));
    }
    if (factura.descuento > 0) linea('Descuento', `- ${plata(factura.descuento)}`, false, '#a00');
    if (factura.iva > 0) linea('IVA', plata(factura.iva));
    linea('TOTAL', plata(factura.total), true);
    if (factura.pagado > 0 && factura.saldo > 0) linea('Pagado', plata(factura.pagado));
    if (factura.saldo > 0) linea('Saldo pendiente', plata(factura.saldo), true, '#a00');

    // ── Notas y pie ──────────────────────────────────────────────────────
    y += 8;
    doc.font('Helvetica').fontSize(8.5).fillColor('#444');
    if (factura.notas) {
      doc.text(factura.notas, MARGEN, y, { width: ANCHO_UTIL });
      y = doc.y + 6;
    }
    if (factura.saldo > 0 && tienda.notaDeVencimiento) {
      doc.text(tienda.notaDeVencimiento, MARGEN, y, { width: ANCHO_UTIL });
      y = doc.y + 6;
    }
    if (tienda.notaAlPie) {
      doc.text(tienda.notaAlPie, MARGEN, y, { width: ANCHO_UTIL });
      y = doc.y + 6;
    }
    if (tienda.agradecimiento) {
      doc.font('Helvetica-Bold').fillColor('#000').text(tienda.agradecimiento, MARGEN, y + 4, {
        width: ANCHO_UTIL,
        align: 'center',
      });
    }

    doc.end();
  });
}
