import PDFDocument from 'pdfkit';
import { plata, type DatosDeLaTienda } from './factura-pdf.js';
import type { CarteraCompleta } from '../cartera/cartera-completa.js';

/**
 * La cartera de todos los clientes en un solo papel, para uso interno.
 *
 * «No voy a imprimir cliente por cliente: le doy imprimir y me salen todos,
 * obviamente separados por cliente». Es lo que Andrea sacaba de una tabla
 * dinámica en Excel. Cada cliente es un bloque con sus facturas y su
 * subtotal; arriba, la deuda total y lo que ya venció. El cálculo vive en
 * `cartera-completa.ts`; acá solo se dibuja.
 */

const MARGEN = 40;
const ANCHO_CARTA = 612;
const ANCHO_UTIL = ANCHO_CARTA - MARGEN * 2;

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

export function pdfDeCarteraCompleta(
  tienda: DatosDeLaTienda,
  cartera: CarteraCompleta,
  generadoEl: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGEN,
      info: {
        Title: `Cartera completa · ${tienda.nombre}`,
        Author: tienda.nombre,
      },
    });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    let y = MARGEN;
    doc.font('Helvetica-Bold').fontSize(16).text(tienda.nombre, MARGEN, y);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#444')
      .text(`Cartera completa · al ${fecha(generadoEl)}`);
    doc.fillColor('#000');
    y = doc.y + 10;
    doc
      .moveTo(MARGEN, y)
      .lineTo(ANCHO_CARTA - MARGEN, y)
      .strokeColor('#bbb')
      .stroke();
    y += 10;

    // ── Los tres números que importan, arriba ─────────────────────────
    const cajas = [
      { titulo: 'DEUDA TOTAL', valor: plata(cartera.saldo), color: '#fff4e5' },
      {
        titulo: 'VENCIDO',
        valor: plata(cartera.vencido),
        color: cartera.vencido > 0 ? '#fde8e8' : '#f5f5f5',
      },
      {
        titulo: 'CLIENTES',
        valor: String(cartera.clientes.length),
        color: '#f5f5f5',
      },
      { titulo: 'FACTURAS', valor: String(cartera.facturas), color: '#f5f5f5' },
    ];
    const ancho = (ANCHO_UTIL - 24) / 4;
    cajas.forEach((c, i) => {
      const x = MARGEN + i * (ancho + 8);
      doc.roundedRect(x, y, ancho, 38, 3).fill(c.color);
      doc
        .fillColor('#666')
        .font('Helvetica')
        .fontSize(7.5)
        .text(c.titulo, x, y + 7, { width: ancho, align: 'center' });
      doc
        .fillColor('#000')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(c.valor, x, y + 18, { width: ancho, align: 'center' });
    });
    y += 52;

    const col = {
      fecha: MARGEN,
      numero: MARGEN + 70,
      vence: MARGEN + 170,
      total: 330,
      pagado: 410,
      saldo: 490,
    };
    const encabezado = (yy: number) => {
      doc
        .rect(MARGEN, yy - 3, ANCHO_UTIL, 15)
        .fill('#f0f0f0')
        .fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Fecha', col.fecha + 4, yy);
      doc.text('Factura', col.numero, yy);
      doc.text('Vence', col.vence, yy);
      doc.text('Total', col.total, yy, { width: 70, align: 'right' });
      doc.text('Abonado', col.pagado, yy, { width: 70, align: 'right' });
      doc.text('Saldo', col.saldo, yy, { width: 82, align: 'right' });
      return yy + 17;
    };
    const saltoSiHaceFalta = (alto: number) => {
      if (y + alto > 730) {
        doc.addPage();
        y = MARGEN;
      }
    };

    if (!cartera.clientes.length) {
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#444')
        .text('Nadie debe nada.', MARGEN, y);
    }

    for (const c of cartera.clientes) {
      saltoSiHaceFalta(60);
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#000')
        .text(c.cliente, MARGEN, y, { width: 330 });
      doc.font('Helvetica').fontSize(8.5).fillColor('#444');
      const detalle = [
        c.telefono,
        c.diasVencidaMax > 0 ? `vencida hace ${c.diasVencidaMax} días` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      if (detalle) doc.text(detalle, MARGEN, doc.y);
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(c.diasVencidaMax > 0 ? '#a00' : '#000');
      doc.text(plata(c.saldo), col.saldo - 40, y, {
        width: 122,
        align: 'right',
      });
      doc.fillColor('#000');
      y = Math.max(doc.y, y + 14) + 4;
      y = encabezado(y);
      doc.font('Helvetica').fontSize(8.5);
      for (const f of c.facturas) {
        saltoSiHaceFalta(14);
        doc.fillColor('#000').text(fecha(f.fecha), col.fecha + 4, y);
        doc.text(f.numero, col.numero, y, { width: 95 });
        doc.fillColor(f.diasVencida > 0 ? '#a00' : '#000');
        doc.text(
          f.vence
            ? `${f.vence}${f.diasVencida > 0 ? ` (+${f.diasVencida} d)` : ''}`
            : '—',
          col.vence,
          y,
          { width: 150 },
        );
        doc.fillColor('#000');
        doc.text(plata(f.total), col.total, y, { width: 70, align: 'right' });
        doc.text(plata(f.pagado), col.pagado, y, { width: 70, align: 'right' });
        doc
          .font('Helvetica-Bold')
          .text(plata(f.saldo), col.saldo, y, { width: 82, align: 'right' })
          .font('Helvetica');
        y += 13;
      }
      doc
        .moveTo(MARGEN, y)
        .lineTo(ANCHO_CARTA - MARGEN, y)
        .strokeColor('#ddd')
        .stroke();
      doc.font('Helvetica').fontSize(8.5).fillColor('#444');
      doc.text(
        `${c.facturas.length} factura${c.facturas.length === 1 ? '' : 's'} · facturado ${plata(c.facturado)} · abonado ${plata(c.pagado)}`,
        MARGEN + 4,
        y + 3,
      );
      doc.fillColor('#000');
      y += 24;
    }

    saltoSiHaceFalta(40);
    doc
      .moveTo(MARGEN, y)
      .lineTo(ANCHO_CARTA - MARGEN, y)
      .strokeColor('#000')
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('TOTAL POR COBRAR', MARGEN, y + 8);
    doc.text(plata(cartera.saldo), col.saldo - 40, y + 8, {
      width: 122,
      align: 'right',
    });
    doc.end();
  });
}
