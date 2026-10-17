import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from '../storefront/entities/ecommerce-order-item.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { ProductStatus } from '../common/enums/product-status.enum.js';
import { EcommerceOrderStatus } from '../common/enums/ecommerce-order-status.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { PosService } from '../pos/pos.service.js';
import { DocumentosService } from '../documentos/documentos.service.js';
import {
  armarVentaDelPedido,
  vencimientoPorDefecto,
  mensajeDeAceptacion,
  mensajeDeRechazo,
  type Agregado,
} from '../storefront/pedido-a-venta.js';
import { AceptarPedidoDto, RechazarPedidoDto } from './dto/pedidos.dto.js';
import {
  elegirClienteDelPedido,
  primerNombre,
  telefonoComparable,
} from './cliente-del-pedido.js';

/**
 * Aceptar o rechazar un pedido del catálogo, avisándole al cliente.
 *
 * «Yo acepto, le pongo el 10, el 15 o el 30, y la factura se hace
 * automática. Y esa factura le llega al WhatsApp del cliente». Hasta ahora el
 * pedido solo cambiaba de estado y la venta había que digitarla aparte.
 *
 * Aceptar **crea la venta** por el mismo camino del mostrador
 * (`PosService.createSale`: inventario, consecutivo, cartera si es a crédito)
 * y deja el pedido enlazado a ella. El cliente queda registrado por su
 * teléfono: así la cartera y los estados de cuenta lo encuentran.
 */
@Injectable()
export class PedidosService {
  constructor(
    @InjectRepository(EcommerceOrder)
    private readonly orderRepo: Repository<EcommerceOrder>,
    @InjectRepository(EcommerceOrderItem)
    private readonly itemRepo: Repository<EcommerceOrderItem>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly pos: PosService,
    private readonly documentos: DocumentosService,
  ) {}

  private async pedidoAbierto(id: string, tenantId: string) {
    const pedido = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    if (pedido.saleId) {
      throw new BadRequestException('Este pedido ya tiene factura.');
    }
    if (
      pedido.status === EcommerceOrderStatus.CANCELLED ||
      pedido.status === EcommerceOrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        `El pedido ya está ${pedido.status === EcommerceOrderStatus.CANCELLED ? 'cancelado' : 'entregado'}.`,
      );
    }
    return pedido;
  }

  /**
   * Las fichas que podrían ser este cliente: mismo teléfono (últimos diez
   * dígitos) o mismo primer nombre. La regla está en `cliente-del-pedido.ts`.
   */
  private async candidatosDelPedido(
    pedido: EcommerceOrder,
    tenantId: string,
  ): Promise<Client[]> {
    const tel = telefonoComparable(pedido.customerPhone);
    const primero = primerNombre(pedido.customerName);
    if (tel.length < 7 && !primero) return [];
    return this.clientRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.is_active = true')
      .andWhere('c.is_generic = false')
      .andWhere(
        `((:tel <> '' AND right(regexp_replace(coalesce(c.phone,''), '\\D', '', 'g'), 10) = :tel)
          OR (:primero <> '' AND split_part(translate(lower(trim(c.first_name)), 'áéíóúüñ', 'aeiouun'), ' ', 1) = :primeroSinEnie))`,
        {
          tel: tel.length >= 7 ? tel : '',
          primero,
          primeroSinEnie: primero.replace(/ñ/g, 'n'),
        },
      )
      .orderBy('c.created_at', 'ASC')
      .limit(50)
      .getMany();
  }

  /** Lo que se le muestra a quien acepta: con quién se va a facturar y los parecidos. */
  async clienteSugerido(id: string, tenantId: string) {
    const pedido = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    const candidatos = await this.candidatosDelPedido(pedido, tenantId);
    const { cliente, motivo, parecidos } = elegirClienteDelPedido(
      { nombre: pedido.customerName, telefono: pedido.customerPhone },
      candidatos,
    );
    const ventas = await this.ventasPorCliente(
      [cliente, ...parecidos].filter(Boolean).map((c) => c!.id),
      tenantId,
    );
    const ficha = (c: Client) => ({
      id: c.id,
      nombre: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      telefono: c.phone ?? null,
      documento: c.documentNumber ?? null,
      ventas: ventas[c.id] ?? 0,
    });
    return {
      pedido: { nombre: pedido.customerName, telefono: pedido.customerPhone },
      sugerido: cliente ? { ...ficha(cliente), motivo } : null,
      parecidos: parecidos.map(ficha),
    };
  }

  private async ventasPorCliente(
    ids: string[],
    tenantId: string,
  ): Promise<Record<string, number>> {
    if (!ids.length) return {};
    const filas: { client_id: string; n: string }[] =
      await this.clientRepo.query(
        `SELECT client_id, count(*) AS n FROM sales
        WHERE tenant_id = $1 AND client_id = ANY($2::uuid[]) GROUP BY client_id`,
        [tenantId, ids],
      );
    return Object.fromEntries(filas.map((f) => [f.client_id, Number(f.n)]));
  }

  /**
   * El cliente del pedido. `clienteId` es el que eligió quien acepta;
   * `clienteNuevo`, que no es ninguno de los que hay. Sin ninguno de los dos,
   * decide la regla. Si el elegido no tiene teléfono se le guarda el del
   * pedido: es el ancla para la próxima vez.
   */
  private async clienteDelPedido(
    pedido: EcommerceOrder,
    tenantId: string,
    eleccion: { clienteId?: string; clienteNuevo?: boolean } = {},
  ): Promise<Client | null> {
    let cliente: Client | null = null;
    if (eleccion.clienteId) {
      cliente = await this.clientRepo.findOne({
        where: { id: eleccion.clienteId, tenantId },
      });
      if (!cliente) throw new BadRequestException('Ese cliente no existe.');
    } else if (!eleccion.clienteNuevo) {
      cliente = elegirClienteDelPedido(
        { nombre: pedido.customerName, telefono: pedido.customerPhone },
        await this.candidatosDelPedido(pedido, tenantId),
      ).cliente;
    }

    if (cliente) {
      if (
        !telefonoComparable(cliente.phone) &&
        telefonoComparable(pedido.customerPhone)
      ) {
        cliente.phone = pedido.customerPhone;
        await this.clientRepo.update(cliente.id, {
          phone: pedido.customerPhone,
        });
      }
      return cliente;
    }

    // Sin teléfono ni elección no hay con qué anclarlo: venta sin cliente,
    // como antes.
    if (!eleccion.clienteNuevo && !telefonoComparable(pedido.customerPhone))
      return null;
    const [nombre, ...apellido] = (pedido.customerName ?? 'Cliente')
      .trim()
      .split(/\s+/);
    return this.clientRepo.save(
      this.clientRepo.create({
        tenantId,
        firstName: nombre || 'Cliente',
        lastName: apellido.join(' '),
        phone: pedido.customerPhone,
        email: pedido.customerEmail || undefined,
        address:
          [pedido.shippingAddress, pedido.shippingAddressDetails]
            .filter(Boolean)
            .join(' · ') || undefined,
      }),
    );
  }

  private enlaceDeWhatsApp(
    telefono: string | null | undefined,
    texto: string,
  ): string | null {
    const d = (telefono ?? '').replace(/\D/g, '');
    if (!d) return null;
    const numero = d.length === 10 ? `57${d}` : d;
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  }

  /**
   * Los renglones que la tienda agrega al aceptar, con nombre y precio de
   * lista: lo que el cliente pidió por WhatsApp después de pedir por el
   * catálogo. Una variante ajena o apagada no se agrega.
   */
  private async agregadosConDatos(
    dto: AceptarPedidoDto,
    tenantId: string,
  ): Promise<Agregado[]> {
    if (!dto.agregados?.length) return [];
    const variantes = await this.variantRepo.find({
      where: { id: In(dto.agregados.map((g) => g.variantId)), tenantId },
      relations: ['product'],
    });
    const porId = new Map(variantes.map((v) => [v.id, v]));
    return dto.agregados.map((g) => {
      const v = porId.get(g.variantId);
      if (!v || !v.isActive || v.product?.status !== ProductStatus.ACTIVE)
        throw new BadRequestException(
          'Uno de los productos agregados no existe o está inactivo.',
        );
      return {
        variantId: v.id,
        nombre: v.product.displayName || v.product.name,
        cantidad: g.cantidad,
        precioDeLista:
          v.priceOverride != null && Number(v.priceOverride) > 0
            ? Number(v.priceOverride)
            : Number(v.product.basePrice),
        precioUnitario: g.precioUnitario,
        sinDescuento: g.sinDescuento,
      };
    });
  }

  async aceptar(
    id: string,
    dto: AceptarPedidoDto,
    userId: string,
    tenantId: string,
  ) {
    const pedido = await this.pedidoAbierto(id, tenantId);
    const items = await this.itemRepo.find({
      where: { orderId: pedido.id, tenantId },
    });
    const agregados = await this.agregadosConDatos(dto, tenantId);
    const armada = armarVentaDelPedido(
      items.map((i) => ({
        itemId: i.id,
        variantId: i.variantId,
        nombre: i.productName,
        cantidadPedida: i.quantity,
        precioUnitario: Number(i.unitPrice),
      })),
      {
        cantidades: dto.cantidades,
        precios: dto.precios,
        sinDescuento: dto.sinDescuento,
        agregados,
        descuentoPorcentaje: dto.descuentoPorcentaje,
      },
    );
    if (armada.error) throw new BadRequestException(armada.error);

    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    const warehouseId =
      dto.warehouseId ??
      pedido.warehouseId ??
      settings?.defaultWarehouseId ??
      null;
    if (!warehouseId)
      throw new BadRequestException(
        'La tienda no tiene bodega de venta configurada.',
      );
    const cliente = await this.clienteDelPedido(pedido, tenantId, {
      clienteId: dto.clienteId,
      clienteNuevo: dto.clienteNuevo,
    });
    const metodo = dto.metodoDePago ?? PaymentMethod.CREDITO;
    const total = armada.renglones.reduce(
      (s, r) =>
        s +
        Math.round(r.quantity * r.unitPrice * (1 - r.discountPercent / 100)),
      0,
    );
    const venta = await this.pos.createSale(
      {
        clientId: cliente?.id,
        warehouseId,
        items: armada.renglones,
        payments: [{ method: metodo, amount: total }],
        // Sin fecha, vence a los días que la tienda configuró (o 30): el POS
        // la propone sola y aquí fallaba con «requieren fecha de vencimiento».
        creditDueDate:
          metodo === PaymentMethod.CREDITO
            ? dto.creditDueDate ||
              vencimientoPorDefecto(settings?.creditDefaultDays)
            : undefined,
        notes: [`Pedido ${pedido.orderNumber}`, dto.notas]
          .filter(Boolean)
          .join(' · '),
        applyTax: false,
      },
      userId,
      tenantId,
    );

    pedido.saleId = venta.id;
    pedido.status = EcommerceOrderStatus.CONFIRMED;
    pedido.adminNotes = [
      pedido.adminNotes,
      `Aceptado → factura ${venta.invoiceNumber ?? venta.saleNumber}`,
    ]
      .filter(Boolean)
      .join('\n');
    await this.orderRepo.save(pedido);

    // El PDF para mandarle: si el almacenamiento no está, el mensaje va sin
    // enlace y se dice; aceptar el pedido no puede depender de eso.
    let enlaceFactura: string | null = null;
    try {
      enlaceFactura = (
        await this.documentos.enlaceDeFactura(venta.id, tenantId, [])
      ).url;
    } catch {
      enlaceFactura = null;
    }
    const mensaje = mensajeDeAceptacion({
      tienda: settings?.storeName ?? 'la tienda',
      cliente: pedido.customerName,
      numeroPedido: pedido.orderNumber,
      numeroFactura: venta.invoiceNumber ?? venta.saleNumber,
      total: Number(venta.total),
      descuentoPorcentaje: armada.descuentoPorcentaje,
      recortes: armada.recortes,
      agregados: armada.agregados,
      aPrecioFijo: armada.aPrecioFijo,
      enlaceFactura,
    });
    return {
      pedido,
      saleId: venta.id,
      numeroFactura: venta.invoiceNumber ?? venta.saleNumber,
      total: Number(venta.total),
      recortes: armada.recortes,
      agregados: armada.agregados,
      enlaceFactura,
      whatsappUrl: this.enlaceDeWhatsApp(pedido.customerPhone, mensaje),
    };
  }

  async rechazar(id: string, dto: RechazarPedidoDto, tenantId: string) {
    const pedido = await this.pedidoAbierto(id, tenantId);
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    pedido.status = EcommerceOrderStatus.CANCELLED;
    pedido.adminNotes = [
      pedido.adminNotes,
      `Rechazado${dto.motivo ? `: ${dto.motivo}` : ''}`,
    ]
      .filter(Boolean)
      .join('\n');
    await this.orderRepo.save(pedido);
    const mensaje = mensajeDeRechazo({
      tienda: settings?.storeName ?? 'la tienda',
      cliente: pedido.customerName,
      numeroPedido: pedido.orderNumber,
      motivo: dto.motivo,
    });
    return {
      pedido,
      whatsappUrl: this.enlaceDeWhatsApp(pedido.customerPhone, mensaje),
    };
  }
}
