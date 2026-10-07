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
import {
  descuentoDelRenglon,
  resumenDelDescuento,
  rotuloDelDescuento,
  textoDelPorcentaje,
} from './descuento-de-la-factura.js';
import PDFDocument from 'pdfkit';
import { contarLaFactura, totalesDeLaFactura } from './conteo-de-la-factura.js';

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
  /** La nota al pie solo si la factura no lleva descuento (pronto pago). */
  notaAlPieSoloSinDescuento?: boolean;
  /** Solo si hay saldo: «Pague antes del…». */
  notaDeVencimiento?: string | null;
  /** «¡Gracias por su compra!». */
  agradecimiento?: string | null;
  /** Si la factura muestra el código de cada renglón. */
  muestraCodigos: boolean;
  /**
   * Cómo llama la tienda a lo que vende: una zapatería cuenta **pares**, una
   * perfumería **unidades**. Solo cambia la palabra, la cuenta es la misma.
   */
  rotuloDeUnidades?: 'pares' | 'unidades';
}

export interface RenglonDeFactura {
  nombre: string;
  /** «38 / Negro». */
  detalle?: string | null;
  codigo?: string | null;
  cantidad: number;
  precioUnitario: number;
  total: number;
  /** El renglón es una caja cerrada: cuenta aparte en el resumen del pie. */
  esCaja?: boolean;
  /** Precio de lista al vender: si es mayor al cobrado, sale tachado. */
  precioDeLista?: number | null;
  /** Descuento por línea, en porcentaje. */
  descuentoPorcentaje?: number | null;
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
  opciones: { comprimir?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGEN,
      // Sin comprimir solo en pruebas: así se puede leer qué quedó en cada hoja.
      compress: opciones.comprimir ?? true,
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
      .text(tienda.nombre, xTienda, y, {
        width: ANCHO_UTIL - (xTienda - MARGEN),
      });
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    if (tienda.lema) doc.text(tienda.lema);
    const contacto = [tienda.direccion, tienda.ciudad]
      .filter(Boolean)
      .join(' · ');
    if (contacto) doc.text(contacto);
    if (tienda.whatsapp) doc.text(`WhatsApp: ${tienda.whatsapp}`);
    doc.fillColor('#000');
    y = Math.max(doc.y, y + (tienda.logo ? 60 : 0)) + 14;

    // ── Número y fechas ──────────────────────────────────────────────────
    doc
      .moveTo(MARGEN, y)
      .lineTo(ANCHO_CARTA - MARGEN, y)
      .strokeColor('#bbb')
      .stroke();
    y += 10;
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(`Factura ${factura.numero}`, MARGEN, y);
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    doc.text(`Fecha: ${fecha(factura.fecha)}`, ANCHO_CARTA - MARGEN - 200, y, {
      width: 200,
      align: 'right',
    });
    if (factura.vence) {
      doc.text(
        `Vence: ${fecha(factura.vence)}`,
        ANCHO_CARTA - MARGEN - 200,
        y + 12,
        {
          width: 200,
          align: 'right',
        },
      );
    }
    doc.fillColor('#000');
    y += 30;

    // ── Cliente ──────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).text('CLIENTE', MARGEN, y);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(factura.cliente, MARGEN, y + 12);
    doc.fontSize(9).fillColor('#444');
    const datosCliente = [
      factura.documento ? `Doc. ${factura.documento}` : null,
      factura.telefono,
      factura.direccion,
    ].filter(Boolean);
    if (datosCliente.length) doc.text(datosCliente.join(' · '));
    doc.fillColor('#000');
    y = doc.y + 14;

    // ── Cuánto se lleva: arriba, no al pie ───────────────────────────────
    // «Por lo general a los clientes les da pereza bajar, como que toda la
    // información fuera la de colocar en la parte de arriba». Quien recibe la
    // mercancía cuenta bultos antes de mirar el total en pesos, así que las
    // cifras van antes de la tabla, en recuadros que se leen de un vistazo.
    const totales = totalesDeLaFactura(
      contarLaFactura(factura.renglones),
      tienda.rotuloDeUnidades ?? 'unidades',
    );
    if (totales.length) {
      const ancho = (ANCHO_UTIL - (totales.length - 1) * 8) / totales.length;
      const alto = 34;
      totales.forEach((t, i) => {
        const x = MARGEN + i * (ancho + 8);
        doc.roundedRect(x, y, ancho, alto, 3).fill('#f5f5f5');
        doc.fillColor('#666').font('Helvetica').fontSize(7.5);
        doc.text(t.titulo.toUpperCase(), x, y + 6, {
          width: ancho,
          align: 'center',
        });
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(14);
        doc.text(t.valor, x, y + 16, { width: ancho, align: 'center' });
      });
      doc.font('Helvetica').fontSize(9).fillColor('#000');
      y += alto + 14;
    }

    // ── Tabla de renglones ───────────────────────────────────────────────
    const col = { nombre: MARGEN, cant: 400, unit: 450, total: 520 };
    const filaEncabezado = (yy: number) => {
      doc
        .rect(MARGEN, yy - 3, ANCHO_UTIL, 16)
        .fill('#f0f0f0')
        .fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Producto', col.nombre + 4, yy);
      doc.text('Cant.', col.cant, yy, { width: 40, align: 'right' });
      doc.text('Unitario', col.unit, yy, { width: 60, align: 'right' });
      doc.text('Total', col.total, yy, { width: 52, align: 'right' });
      return yy + 18;
    };
    y = filaEncabezado(y);
    doc.font('Helvetica').fontSize(9);

    // Hasta dónde se puede escribir. Pasarse no «corta»: pdfkit abre otra
    // hoja por su cuenta y sigue escribiendo con la `y` vieja, y la factura
    // de Distri Amber salió con el subtotal en una hoja, el saldo en otra y
    // dos hojas en blanco entre medio.
    const FONDO = doc.page.height - MARGEN;

    for (const r of factura.renglones) {
      const detalle = [
        r.detalle,
        tienda.muestraCodigos && r.codigo ? r.codigo : null,
      ]
        .filter(Boolean)
        .join(' · ');
      // Salto de página con el encabezado repetido: una factura de sesenta
      // renglones no cabe en una hoja, y sin encabezado la segunda página es
      // una lista de números sin columnas. Se mide el renglón antes de
      // escribirlo: uno con descuento o con nombre largo es más alto.
      const altoDelNombre =
        doc.fontSize(9).heightOfString(r.nombre, { width: 340 }) +
        (detalle
          ? doc.fontSize(7.5).heightOfString(detalle, { width: 340 })
          : 0);
      doc.fontSize(9);
      const altoDelRenglon =
        Math.max(
          altoDelNombre,
          descuentoDelRenglon(r).tieneDescuento ? 22 : 12,
        ) + 4;
      if (y + altoDelRenglon > FONDO) {
        doc.addPage();
        y = filaEncabezado(MARGEN);
        doc.font('Helvetica').fontSize(9);
      }
      doc.fillColor('#000').text(r.nombre, col.nombre + 4, y, { width: 340 });
      if (detalle) {
        doc
          .fontSize(7.5)
          .fillColor('#666')
          .text(detalle, col.nombre + 4, doc.y, { width: 340 });
        doc.fontSize(9).fillColor('#000');
      }
      // El alto del renglón lo manda la columna del nombre, que es la única
      // que puede ocupar dos líneas. Se toma ANTES de escribir los números:
      // cada `text()` de una línea deja `doc.y` en su propia línea, y leerlo
      // después daba un alto de una sola, con la divisoria tachando el detalle.
      const yFinal = doc.y;
      doc.text(String(r.cantidad), col.cant, y, { width: 40, align: 'right' });
      // El precio real tachado y debajo lo que se cobró: «el cliente ve
      // 40.000 y dice "me la estás vendiendo en 40"», por más que el pie
      // diga que el descuento va incluido. Ver `descuento-de-la-factura.ts`.
      const rebaja = descuentoDelRenglon(r);
      let yUnit = y + 12;
      if (rebaja.tieneDescuento) {
        doc.fontSize(7.5).fillColor('#888');
        doc.text(plata(rebaja.lista), col.unit, y, {
          width: 60,
          align: 'right',
          strike: true,
        });
        doc.fontSize(9).fillColor('#000');
        doc.text(plata(rebaja.cobrado), col.unit, y + 10, {
          width: 60,
          align: 'right',
        });
        doc.fontSize(7).fillColor('#a00');
        doc.text(
          `-${textoDelPorcentaje(rebaja.porcentaje)}`,
          col.cant - 30,
          y + 10,
          {
            width: 70,
            align: 'right',
          },
        );
        doc.fontSize(9).fillColor('#000');
        yUnit = y + 22;
      } else {
        doc.text(plata(r.precioUnitario), col.unit, y, {
          width: 60,
          align: 'right',
        });
      }
      doc.text(plata(r.total), col.total, y, { width: 52, align: 'right' });
      y = Math.max(yFinal, yUnit) + 4;
      doc
        .moveTo(MARGEN, y - 2)
        .lineTo(ANCHO_CARTA - MARGEN, y - 2)
        .strokeColor('#eee')
        .stroke();
    }

    // ── Totales ──────────────────────────────────────────────────────────
    // El bloque de totales y la frase del descuento van juntos y enteros: si
    // no caben en lo que queda de hoja, pasan completos a la siguiente.
    const resumen = resumenDelDescuento(factura.renglones, factura.descuento);
    const lineasDeTotales =
      (resumen.descuento > 0 || factura.iva > 0 ? 1 : 0) +
      (resumen.descuento > 0 ? 1 : 0) +
      (factura.iva > 0 ? 1 : 0) +
      1 +
      (factura.pagado > 0 && factura.saldo > 0 ? 1 : 0) +
      (factura.saldo > 0 ? 1 : 0);
    const altoDeLaFrase = resumen.frase
      ? doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .heightOfString(resumen.frase, { width: ANCHO_UTIL }) + 6
      : 0;
    const altoDeTotales = 6 + lineasDeTotales * 16 + 8 + altoDeLaFrase;
    if (y + altoDeTotales > FONDO) {
      doc.addPage();
      y = MARGEN;
    }
    y += 6;
    const linea = (
      rotulo: string,
      valor: string,
      negrita = false,
      color = '#000',
    ) => {
      doc
        .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(negrita ? 11 : 9)
        .fillColor(color);
      doc.text(rotulo, 380, y, { width: 120, align: 'right' });
      doc.text(valor, 505, y, { width: 67, align: 'right' });
      y += negrita ? 16 : 13;
      doc.fillColor('#000');
    };
    // El subtotal es a precio **real** y el descuento junta las rebajas por
    // renglón con la general, en pesos y en porcentaje: así subtotal menos
    // descuento (más IVA) cuadra con el total que el cliente ve.
    if (resumen.descuento > 0 || factura.iva > 0) {
      linea(
        'Subtotal',
        plata(
          resumen.descuento > 0 ? resumen.subtotalDeLista : factura.subtotal,
        ),
      );
    }
    if (resumen.descuento > 0) {
      linea(
        rotuloDelDescuento(resumen),
        `- ${plata(resumen.descuento)}`,
        false,
        '#a00',
      );
    }
    if (factura.iva > 0) linea('IVA', plata(factura.iva));
    linea('TOTAL', plata(factura.total), true);
    if (factura.pagado > 0 && factura.saldo > 0)
      linea('Pagado', plata(factura.pagado));
    if (factura.saldo > 0)
      linea('Saldo pendiente', plata(factura.saldo), true, '#a00');

    // ── Notas y pie ──────────────────────────────────────────────────────
    y += 8;
    if (resumen.frase) {
      // En palabras, además de la tabla: es lo que el cliente lee primero.
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#a00');
      doc.text(resumen.frase, MARGEN, y, { width: ANCHO_UTIL });
      y = doc.y + 6;
    }
    // Las notas del pie, una por una: la que no quepa pasa entera.
    const nota = (texto: string, negrita = false, extra = 0) => {
      doc
        .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.5)
        .fillColor(negrita ? '#000' : '#444');
      const alto = doc.heightOfString(texto, { width: ANCHO_UTIL });
      if (y + extra + alto > FONDO) {
        doc.addPage();
        y = MARGEN;
      }
      doc.text(texto, MARGEN, y + extra, {
        width: ANCHO_UTIL,
        align: negrita ? 'center' : 'left',
      });
      y = doc.y + 6;
    };
    if (factura.notas) nota(factura.notas);
    if (factura.saldo > 0 && tienda.notaDeVencimiento)
      nota(tienda.notaDeVencimiento);
    // «Sujeta a descuento a los 30 días» con el descuento ya aplicado sobra
    // (Andrea): la tienda decide si la nota va solo en facturas sin rebaja.
    const notaSobra =
      tienda.notaAlPieSoloSinDescuento === true && resumen.descuento > 0;
    if (tienda.notaAlPie && !notaSobra) nota(tienda.notaAlPie);
    if (tienda.agradecimiento) nota(tienda.agradecimiento, true, 4);

    doc.end();
  });
}
