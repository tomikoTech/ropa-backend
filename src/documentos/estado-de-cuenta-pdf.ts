/**
 * El estado de cuenta del cliente, en PDF.
 *
 * Es lo que se manda por WhatsApp cuando hay que cobrar: «esto es lo que me
 * debes, factura por factura». Antes se exportaba a Excel, que en un celular
 * no abre bien y que nadie le manda a un cliente. Un PDF sí.
 *
 * Solo las facturas con saldo van con sus renglones; las pagadas se listan en
 * una línea. Lo que el cliente necesita es saber **qué debe**, no releer lo que
 * ya pagó.
 */
import PDFDocument from 'pdfkit';
import { plata, type DatosDeLaTienda } from './factura-pdf.js';

export interface FacturaDelEstado {
  numero: string;
  fecha: string;
  vence?: string | null;
  total: number;
  pagado: number;
  saldo: number;
  estado: 'PAID' | 'PARTIAL' | 'PENDING';
  renglones: { nombre: string; detalle?: string | null; cantidad: number; total: number }[];
}

export interface DatosDelEstadoDeCuenta {
  cliente: string;
  documento?: string | null;
  telefono?: string | null;
  /** Cuándo se generó: un estado de cuenta sin fecha no sirve de prueba. */
  generadoEl: string;
  facturas: FacturaDelEstado[];
  totalFacturado: number;
  totalPagado: number;
  deuda: number;
}

const fecha = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(d);
};

const ESTADO: Record<FacturaDelEstado['estado'], string> = {
  PAID: 'Pagada',
  PARTIAL: 'Abonada',
  PENDING: 'Pendiente',
};

const MARGEN = 40;
const ANCHO_CARTA = 612;
const ANCHO_UTIL = ANCHO_CARTA - MARGEN * 2;

export function pdfDeEstadoDeCuenta(
  tienda: DatosDeLaTienda,
  estado: DatosDelEstadoDeCuenta,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGEN,
      info: { Title: `Estado de cuenta · ${estado.cliente}`, Author: tienda.nombre },
    });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    // ── Encabezado ───────────────────────────────────────────────────────
    let y = MARGEN;
    if (tienda.logo) {
      try {
        doc.image(tienda.logo, MARGEN, y, { fit: [110, 60] });
      } catch {
        /* sin logo, que es lo que había antes */
      }
    }
    const xTienda = MARGEN + (tienda.logo ? 125 : 0);
    doc.font('Helvetica-Bold').fontSize(16).text(tienda.nombre, xTienda, y);
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    if (tienda.whatsapp) doc.text(`WhatsApp: ${tienda.whatsapp}`);
    doc.fillColor('#000');
    y = Math.max(doc.y, y + (tienda.logo ? 60 : 0)) + 14;

    doc.moveTo(MARGEN, y).lineTo(ANCHO_CARTA - MARGEN, y).strokeColor('#bbb').stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(13).text('Estado de cuenta', MARGEN, y);
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    doc.text(`Al ${fecha(estado.generadoEl)}`, ANCHO_CARTA - MARGEN - 200, y, {
      width: 200,
      align: 'right',
    });
    doc.fillColor('#000');
    y += 24;

    doc.font('Helvetica-Bold').fontSize(9).text('CLIENTE', MARGEN, y);
    doc.font('Helvetica').fontSize(10).text(estado.cliente, MARGEN, y + 12);
    const datos = [
      estado.documento ? `Doc. ${estado.documento}` : null,
      estado.telefono,
    ].filter(Boolean);
    if (datos.length) doc.fontSize(9).fillColor('#444').text(datos.join(' · ')).fillColor('#000');
    y = doc.y + 14;

    // ── La deuda, grande y primero ───────────────────────────────────────
    // Es lo único que el cliente va a leer. Que no haya que buscarlo.
    doc.rect(MARGEN, y, ANCHO_UTIL, 46).fill(estado.deuda > 0 ? '#fff4e5' : '#eef9f0');
    doc.fillColor('#000').font('Helvetica').fontSize(9);
    doc.text('SALDO PENDIENTE', MARGEN + 12, y + 8);
    doc.font('Helvetica-Bold').fontSize(18).fillColor(estado.deuda > 0 ? '#b45309' : '#15803d');
    doc.text(plata(estado.deuda), MARGEN + 12, y + 20);
    doc.font('Helvetica').fontSize(8.5).fillColor('#444');
    doc.text(
      `Facturado ${plata(estado.totalFacturado)} · Pagado ${plata(estado.totalPagado)}`,
      MARGEN + 250,
      y + 18,
      { width: ANCHO_UTIL - 262, align: 'right' },
    );
    doc.fillColor('#000');
    y += 60;

    // ── Facturas ─────────────────────────────────────────────────────────
    const col = { num: MARGEN, fecha: 130, estado: 230, total: 330, pagado: 410, saldo: 490 };
    const encabezado = (yy: number) => {
      doc.rect(MARGEN, yy - 3, ANCHO_UTIL, 16).fill('#f0f0f0').fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Factura', col.num + 4, yy);
      doc.text('Fecha', col.fecha, yy);
      doc.text('Estado', col.estado, yy);
      doc.text('Total', col.total, yy, { width: 70, align: 'right' });
      doc.text('Pagado', col.pagado, yy, { width: 70, align: 'right' });
      doc.text('Saldo', col.saldo, yy, { width: 82, align: 'right' });
      return yy + 18;
    };
    y = encabezado(y);

    for (const f of estado.facturas) {
      if (y > 690) {
        doc.addPage();
        y = encabezado(MARGEN);
      }
      const conSaldo = f.saldo > 0;
      doc.font(conSaldo ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000');
      doc.text(f.numero, col.num + 4, y);
      doc.font('Helvetica').fillColor('#444');
      doc.text(fecha(f.fecha), col.fecha, y);
      doc.text(ESTADO[f.estado], col.estado, y);
      doc.fillColor('#000');
      doc.text(plata(f.total), col.total, y, { width: 70, align: 'right' });
      doc.text(plata(f.pagado), col.pagado, y, { width: 70, align: 'right' });
      doc.font(conSaldo ? 'Helvetica-Bold' : 'Helvetica').fillColor(conSaldo ? '#a00' : '#000');
      doc.text(plata(f.saldo), col.saldo, y, { width: 82, align: 'right' });
      doc.fillColor('#000').font('Helvetica');
      y += 13;
      if (f.vence && conSaldo) {
        doc.fontSize(7.5).fillColor('#666').text(`Vence ${fecha(f.vence)}`, col.fecha, y);
        doc.fontSize(9).fillColor('#000');
        y += 11;
      }
      // Los renglones solo de lo que se debe: es lo que el cliente va a
      // discutir, y las pagadas ya no se discuten.
      if (conSaldo && f.renglones.length) {
        doc.fontSize(7.5).fillColor('#555');
        for (const r of f.renglones) {
          if (y > 720) {
            doc.addPage();
            y = MARGEN;
          }
          const det = r.detalle ? ` (${r.detalle})` : '';
          doc.text(`${r.cantidad} × ${r.nombre}${det}`, col.num + 14, y, { width: 330 });
          doc.text(plata(r.total), col.saldo, y, { width: 82, align: 'right' });
          y = doc.y + 1;
        }
        doc.fontSize(9).fillColor('#000');
        y += 3;
      }
      doc.moveTo(MARGEN, y).lineTo(ANCHO_CARTA - MARGEN, y).strokeColor('#eee').stroke();
      y += 5;
    }

    if (!estado.facturas.length) {
      doc.fontSize(9).fillColor('#666').text('Sin facturas a crédito.', MARGEN, y);
    }

    if (tienda.notaAlPie) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#444');
      doc.text(tienda.notaAlPie, MARGEN, Math.max(y + 16, 700), { width: ANCHO_UTIL });
    }
    doc.end();
  });
}
