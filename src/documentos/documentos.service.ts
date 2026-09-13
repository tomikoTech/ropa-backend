/**
 * Los documentos que se le mandan al cliente: factura y estado de cuenta.
 *
 * Se generan en PDF, se alojan en R2 y se devuelve **el enlace**. Es lo que
 * hace posible mandarlos por WhatsApp: `wa.me` solo lleva texto, así que el
 * mensaje va corto —número, total y el enlace— y el cliente abre el PDF en el
 * celular, lo guarda o lo reenvía.
 *
 * El enlace es público pero **inadivinable** (R2 le pone un nombre aleatorio a
 * cada archivo): es el mismo modelo que «cualquiera con el enlace» de Drive, y
 * el mismo con el que ya viven las fotos de los productos. Una factura tiene el
 * nombre del cliente y su teléfono, así que el enlace no se publica en ningún
 * listado ni se puede recorrer: solo lo tiene quien lo recibió.
 */
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosService } from '../pos/pos.service.js';
import { R2Service } from '../uploads/r2.service.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { pdfDeFactura, type DatosDeLaTienda } from './factura-pdf.js';
import { pdfDeEstadoDeCuenta } from './estado-de-cuenta-pdf.js';

@Injectable()
export class DocumentosService {
  constructor(
    private readonly pos: PosService,
    private readonly r2: R2Service,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  /** La factura de una venta, como enlace a un PDF. */
  async enlaceDeFactura(saleId: string, tenantId: string): Promise<{ url: string }> {
    const venta = await this.pos.findOne(saleId, tenantId);
    const tienda = await this.datosDeLaTienda(tenantId);

    const pagado = (venta.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(venta.total);
    const cartera = venta.accountsReceivable?.[0];
    // El saldo sale de cartera si la hay: es la fuente de verdad de lo que se
    // debe. Si no hay cartera, la venta está pagada o pendiente sin crédito.
    const saldo = cartera
      ? Math.max(0, Number(cartera.totalAmount) - Number(cartera.paidAmount))
      : venta.isPaid
        ? 0
        : Math.max(0, total - pagado);

    const pdf = await pdfDeFactura(tienda, {
      numero: venta.invoiceNumber || venta.saleNumber,
      fecha: venta.createdAt.toISOString(),
      vence: cartera?.dueDate ?? null,
      cliente: venta.client
        ? `${venta.client.firstName ?? ''} ${venta.client.lastName ?? ''}`.trim() || 'Consumidor final'
        : 'Consumidor final',
      // El consumidor final es un cliente genérico con un documento de ceros:
      // imprimírselo es imprimir basura.
      documento: venta.client && !venta.client.isGeneric ? venta.client.documentNumber : null,
      telefono: venta.client?.phone ?? null,
      direccion: venta.client?.address ?? null,
      renglones: (venta.items ?? []).map((it) => ({
        nombre: it.productName,
        detalle: [it.variantSize, it.variantColor].filter(Boolean).join(' / ') || null,
        codigo: it.variant?.barcode ?? null,
        cantidad: it.quantity,
        precioUnitario: Number(it.unitPrice),
        total: Number(it.lineTotal),
      })),
      subtotal: Number(venta.subtotal),
      descuento: Number(venta.discountAmount),
      iva: Number(venta.taxAmount),
      total,
      pagado: total - saldo,
      saldo,
      notas: venta.notes ?? null,
    });

    return { url: await this.subir(tenantId, `facturas/${venta.id}.pdf`, pdf) };
  }

  /** El estado de cuenta de un cliente, como enlace a un PDF. */
  async enlaceDeEstadoDeCuenta(clientId: string, tenantId: string): Promise<{ url: string }> {
    const estado = await this.pos.getClientStatement(clientId, tenantId);
    if (!estado.client) throw new NotFoundException('Cliente no encontrado');
    const tienda = await this.datosDeLaTienda(tenantId);

    const pdf = await pdfDeEstadoDeCuenta(tienda, {
      cliente: estado.client.name,
      documento: estado.client.documentNumber,
      telefono: estado.client.phone,
      generadoEl: new Date().toISOString(),
      facturas: estado.invoices.map((f) => ({
        numero: f.invoiceNumber ?? '—',
        fecha: new Date(f.date).toISOString(),
        vence: f.dueDate ? String(f.dueDate) : null,
        total: f.total,
        pagado: f.paidAmount,
        saldo: f.balance,
        estado: f.paymentStatus as 'PAID' | 'PARTIAL' | 'PENDING',
        renglones: f.items.map((it) => ({
          nombre: it.name,
          detalle: [it.size, it.color].filter(Boolean).join(' / ') || null,
          cantidad: it.quantity,
          total: it.lineTotal,
        })),
      })),
      totalFacturado: estado.totals.totalCredit,
      totalPagado: estado.totals.totalPaid,
      deuda: estado.totals.totalDebt,
    });

    return { url: await this.subir(tenantId, `estados-de-cuenta/${clientId}.pdf`, pdf) };
  }

  /**
   * Sube el PDF con **nombre fijo**: regenerarlo reemplaza al anterior.
   *
   * Mandar la misma factura cinco veces por WhatsApp eran cinco archivos para
   * siempre. Ahora son uno, y el enlace no cambia aunque se regenere —así el
   * cliente que guardó el enlace de ayer ve la factura de hoy—.
   *
   * Lo que sí queda pendiente es **cuánto tiempo viven**: eso lo decide una
   * regla de ciclo de vida del bucket (`documentos/` → borrar a los 60 días),
   * que se configura en el panel de R2 y no en código. Ver `R2-CICLO-DE-VIDA`
   * en la documentación.
   */
  private async subir(tenantId: string, nombre: string, pdf: Buffer): Promise<string> {
    if (!this.r2.isConfigured()) {
      // Sin dónde alojarlo no hay enlace que mandar. Se dice claro en vez de
      // devolver una URL rota que el cliente abre y no encuentra nada.
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos no está configurado: no se puede generar el enlace del PDF.',
      );
    }
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const slug = (tenant?.slug ?? tenantId).replace(/[^a-z0-9-]/gi, '');
    return this.r2.uploadConNombre(`documentos/${slug}/${nombre}`, pdf, 'application/pdf');
  }

  /** El encabezado de la tienda, con el logo ya descargado. */
  private async datosDeLaTienda(tenantId: string): Promise<DatosDeLaTienda> {
    const s = await this.settingsRepo.findOne({ where: { tenantId } });
    return {
      nombre: s?.storeName || 'Mi tienda',
      logo: await this.logo(s?.logoUrl),
      direccion: s?.address ?? null,
      ciudad: [s?.storeCityName, s?.storeDepartment].filter(Boolean).join(', ') || null,
      whatsapp: s?.whatsappNumber ?? null,
      lema: s?.invoiceTagline ?? null,
      notaAlPie: s?.invoiceFooterNote ?? null,
      notaDeVencimiento: s?.invoiceDueNote ?? null,
      agradecimiento: s?.invoiceThankYouNote ?? null,
      muestraCodigos: s?.invoiceShowCodes ?? true,
    };
  }

  /**
   * El logo, descargado. Sin logo —o si tarda— la factura sale sin él: un
   * logo que no llega no puede dejar al cliente sin su factura.
   */
  private async logo(url?: string | null): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const tipo = r.headers.get('content-type') ?? '';
      // pdfkit solo entiende PNG y JPEG. Un WebP o un SVG lo tumbarían.
      if (!/png|jpe?g/.test(tipo)) return null;
      return Buffer.from(await r.arrayBuffer());
    } catch {
      return null;
    }
  }
}
