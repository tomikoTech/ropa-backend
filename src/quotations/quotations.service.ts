import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Quotation } from './entities/quotation.entity.js';
import { QuotationItem } from './entities/quotation-item.entity.js';
import { CreateQuotationDto } from './dto/create-quotation.dto.js';
import { UpdateQuotationDto } from './dto/update-quotation.dto.js';
import { ConvertQuotationDto } from './dto/convert-quotation.dto.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { ESTADOS_PENDIENTES, soloLasSuyas } from './ventas-por-autorizar.js';
import { puedeRechazarse, ESTADO_RECHAZADA } from './rechazar-solicitud.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import {
  TaxService,
  type LineCalculation,
} from '../pos/services/tax.service.js';
import { PosService } from '../pos/pos.service.js';

@Injectable()
export class QuotationsService {
  constructor(
    @InjectRepository(Quotation)
    private readonly quotationRepo: Repository<Quotation>,
    @InjectRepository(QuotationItem)
    private readonly itemRepo: Repository<QuotationItem>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    private readonly taxService: TaxService,
    private readonly posService: PosService,
  ) {}

  private async ensureEnabled(tenantId: string): Promise<StoreSettings | null> {
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings?.quotationsEnabled) {
      throw new ForbiddenException(
        'El módulo de Cotizaciones no está habilitado para esta tienda',
      );
    }
    return settings;
  }

  async create(
    dto: CreateQuotationDto,
    userId: string,
    tenantId: string,
  ): Promise<Quotation> {
    const settings = await this.ensureEnabled(tenantId);

    // IVA: mismo criterio que una venta (tasa única de tienda + modo).
    const ivaEnabled = settings ? settings.ivaEnabled : true;
    const applyTax = dto.applyTax ?? ivaEnabled;
    const storeIvaRate = settings ? Number(settings.ivaRate) : 19;
    const effectiveTaxRate = applyTax ? storeIvaRate : 0;
    const ivaMode = settings?.ivaMode === 'added' ? 'added' : 'included';

    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.variantRepo.find({
      where: { id: In(variantIds), tenantId },
      relations: ['product'],
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const lineCalcs: LineCalculation[] = [];
    const itemsData: Partial<QuotationItem>[] = [];
    for (const item of dto.items) {
      const variant = variantById.get(item.variantId);
      if (!variant) {
        throw new BadRequestException(
          `Variante ${item.variantId} no encontrada`,
        );
      }
      const defaultPrice = variant.priceOverride
        ? Number(variant.priceOverride)
        : Number(variant.product.basePrice);
      const unitPrice =
        item.unitPrice != null && Number(item.unitPrice) >= 0
          ? Number(item.unitPrice)
          : defaultPrice;
      const discountPercent = item.discountPercent ?? 0;
      const line = this.taxService.calculateLine(
        unitPrice,
        item.quantity,
        discountPercent,
        effectiveTaxRate,
        ivaMode,
      );
      lineCalcs.push(line);
      itemsData.push({
        variantId: variant.id,
        productName: variant.product.name,
        variantSku: variant.sku,
        variantSize: variant.sizeName,
        variantColor: variant.colorName,
        quantity: item.quantity,
        unitPrice,
        discountPercent,
        taxRate: effectiveTaxRate,
        lineTotal: line.lineTotal,
        tenantId,
      });
    }

    const totals = this.taxService.calculateSaleTotals(lineCalcs);
    // Consecutivo por el máximo existente, no por el conteo: al borrar una
    // cotización el conteo repite un número ya emitido (dos cotizaciones
    // distintas con el mismo COT-xxxxxx).
    const row = await this.quotationRepo
      .createQueryBuilder('q')
      .select(
        "MAX(CAST(substring(q.quote_number FROM '^COT-0*([0-9]+)$') AS integer))",
        'maxnum',
      )
      .where('q.tenant_id = :tenantId', { tenantId })
      .andWhere("q.quote_number ~ '^COT-[0-9]+$'")
      .getRawOne<{ maxnum: string | null }>();
    const quoteNumber = `COT-${String(
      (row?.maxnum ? parseInt(row.maxnum, 10) : 0) + 1,
    ).padStart(6, '0')}`;

    const quotation = this.quotationRepo.create({
      quoteNumber,
      clientId: dto.clientId ?? null,
      warehouseId: dto.warehouseId,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      status: 'DRAFT',
      notes: dto.notes ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      createdById: userId,
      tenantId,
      items: itemsData.map((d) => this.itemRepo.create(d)),
    });
    const saved = await this.quotationRepo.save(quotation);
    return this.findOne(saved.id, tenantId);
  }

  /**
   * Las ventas pendientes que le tocan a quien pregunta.
   *
   * Devolvía **todas las del tenant**: un vendedor externo veía los pedidos de
   * los demás vendedores, con sus clientes y sus precios. Quien no puede
   * autorizar solo ve las suyas. La regla vive en `ventas-por-autorizar.ts`.
   */
  async findAll(
    tenantId: string,
    quien?: { usuarioId: string; puedeAutorizar: boolean },
  ): Promise<Quotation[]> {
    const soloDe = quien
      ? soloLasSuyas({ puedeAutorizar: quien.puedeAutorizar }, quien.usuarioId)
      : null;
    return this.quotationRepo.find({
      where: soloDe ? { tenantId, createdById: soloDe } : { tenantId },
      relations: ['client', 'items'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Cuántas ventas están esperando algo, para el contador del menú.
   *
   * Se cuenta en el servidor: traer la lista entera cada minuto para contarla
   * en el navegador es lo que ya se corrigió con los traslados. Y respeta el
   * mismo alcance que el listado — quien no autoriza cuenta solo las suyas.
   */
  /**
   * Decir «no» a una venta que espera autorización.
   *
   * No se borra: queda con su motivo, para que el vendedor sepa por qué y no
   * vuelva a mandar la misma.
   */
  async reject(
    id: string,
    motivo: string,
    usuarioId: string,
    tenantId: string,
  ) {
    const solicitud = await this.quotationRepo.findOne({
      where: { id, tenantId },
    });
    if (!solicitud) {
      throw new NotFoundException('Esa solicitud no existe.');
    }
    const veredicto = puedeRechazarse(solicitud.status, motivo);
    if (!veredicto.permitido) {
      throw new BadRequestException(veredicto.porque);
    }
    solicitud.status = ESTADO_RECHAZADA;
    solicitud.rejectionReason = motivo.trim();
    solicitud.rejectedAt = new Date();
    solicitud.rejectedByUserId = usuarioId;
    return this.quotationRepo.save(solicitud);
  }

  async contarPendientes(
    tenantId: string,
    quien: { usuarioId: string; puedeAutorizar: boolean },
  ): Promise<{ total: number }> {
    const soloDe = soloLasSuyas(
      { puedeAutorizar: quien.puedeAutorizar },
      quien.usuarioId,
    );
    const total = await this.quotationRepo.count({
      where: {
        tenantId,
        status: In([...ESTADOS_PENDIENTES]),
        ...(soloDe ? { createdById: soloDe } : {}),
      },
    });
    return { total };
  }

  async findOne(
    id: string,
    tenantId: string,
    quien?: { usuarioId: string; puedeAutorizar: boolean },
  ): Promise<Quotation> {
    const quotation = await this.quotationRepo.findOne({
      where: { id, tenantId },
      relations: ['client', 'items'],
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    // Entrar por la URL no puede saltarse el listado: quien no autoriza solo
    // llega a las suyas.
    const soloDe = quien
      ? soloLasSuyas({ puedeAutorizar: quien.puedeAutorizar }, quien.usuarioId)
      : null;
    if (soloDe && quotation.createdById !== soloDe) {
      throw new NotFoundException('Cotización no encontrada');
    }
    return quotation;
  }

  async update(
    id: string,
    dto: UpdateQuotationDto,
    tenantId: string,
  ): Promise<Quotation> {
    const quotation = await this.findOne(id, tenantId);
    if (quotation.status === 'CONVERTED') {
      throw new BadRequestException('La cotización ya fue convertida en venta');
    }
    if (dto.status) quotation.status = dto.status as Quotation['status'];
    if (dto.notes !== undefined) quotation.notes = dto.notes;
    if (dto.expiresAt !== undefined) {
      quotation.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    await this.quotationRepo.save(quotation);
    return this.findOne(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const quotation = await this.findOne(id, tenantId);
    await this.quotationRepo.remove(quotation);
  }

  // Convierte la cotización en una venta real (descuenta inventario).
  async convert(
    id: string,
    dto: ConvertQuotationDto,
    userId: string,
    tenantId: string,
  ) {
    await this.ensureEnabled(tenantId);
    const quotation = await this.findOne(id, tenantId);
    if (quotation.status === 'CONVERTED') {
      throw new BadRequestException('La cotización ya fue convertida');
    }
    if (!quotation.items?.length) {
      throw new BadRequestException('La cotización no tiene ítems');
    }

    const sale = await this.posService.createSale(
      {
        clientId: quotation.clientId ?? undefined,
        warehouseId: quotation.warehouseId,
        items: quotation.items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          discountPercent: Number(i.discountPercent),
          unitPrice: Number(i.unitPrice),
        })),
        payments: dto.payments,
        markAsPaid: dto.markAsPaid,
        creditDueDate: dto.creditDueDate,
        creditNotes: dto.creditNotes,
        notes: `Cotización ${quotation.quoteNumber}`,
      },
      userId,
      tenantId,
    );

    quotation.status = 'CONVERTED';
    quotation.convertedSaleId = sale.id;
    await this.quotationRepo.save(quotation);

    return { quotation: await this.findOne(id, tenantId), sale };
  }
}
