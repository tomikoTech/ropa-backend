import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { Size } from '../catalogs/entities/size.entity.js';
import { Color } from '../catalogs/entities/color.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { Supplier } from '../suppliers/entities/supplier.entity.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { SaleChannel } from '../common/enums/sale-channel.enum.js';
import { buildReportQuery } from './engine/report-filters.js';
import {
  REPORT_DEFINITIONS,
  UNCOVERED_LEGACY_REPORTS,
  findReportDefinition,
} from './engine/report-catalog.js';
import type {
  ReportDefinition,
  ReportOption,
  ReportOptionSource,
  ReportResult,
} from './engine/report-types.js';
import { InventoryReportService } from './data/inventory-report.service.js';
import { ValuationReportService } from './data/valuation-report.service.js';
import { ProfitReportService } from './data/profit-report.service.js';
import { PriceControlReportService } from './data/price-control-report.service.js';
import { ReceivablesReportService } from './data/receivables-report.service.js';
import { MovementsReportService } from './data/movements-report.service.js';

export type ReportOptions = Record<ReportOptionSource, ReportOption[]>;

/**
 * Punto único de entrada del motor: resuelve la clave del reporte, normaliza
 * los filtros y devuelve columnas + filas + totales.
 *
 * Los reportes no se registran en un `if` gigante sino en un mapa: agregar uno
 * nuevo es una entrada aquí y una definición en el catálogo.
 */
@Injectable()
export class ReportEngineService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Size) private readonly sizeRepo: Repository<Size>,
    @InjectRepository(Color) private readonly colorRepo: Repository<Color>,
    @InjectRepository(Bank) private readonly bankRepo: Repository<Bank>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    private readonly inventory: InventoryReportService,
    private readonly valuation: ValuationReportService,
    private readonly profit: ProfitReportService,
    private readonly priceControl: PriceControlReportService,
    private readonly receivables: ReceivablesReportService,
    private readonly movements: MovementsReportService,
  ) {}

  catalog(): {
    reports: ReportDefinition[];
    uncovered: { name: string; reason: string }[];
  } {
    return {
      reports: REPORT_DEFINITIONS,
      uncovered: UNCOVERED_LEGACY_REPORTS,
    };
  }

  async run(
    key: string,
    raw: Record<string, unknown>,
    tenantId: string,
  ): Promise<ReportResult> {
    const definition = findReportDefinition(key);
    if (!definition) {
      const known = REPORT_DEFINITIONS.map((d) => d.key).join(', ');
      throw new NotFoundException(
        `No existe el reporte "${key}". Los disponibles son: ${known}.`,
      );
    }

    const query = buildReportQuery(raw);

    const runners = {
      inventario: () => this.inventory.run(query, tenantId),
      valorizacion: () => this.valuation.run(query, tenantId),
      utilidad: () => this.profit.run(query, tenantId),
      'control-precios': () => this.priceControl.run(query, tenantId),
      cartera: () => this.receivables.run(query, tenantId),
      movimientos: () => this.movements.run(query, tenantId),
    } as const satisfies Record<string, () => Promise<ReportResult>>;

    const runner = runners[key as keyof typeof runners];
    const result = await runner();

    // Los avisos del reporte y los de la normalización de filtros (una fecha
    // inválida, un rango al revés) llegan juntos: el usuario no distingue de
    // dónde viene el problema, solo necesita saber que hay uno.
    return {
      ...result,
      warnings: [...query.warnings, ...(result.warnings ?? [])],
    };
  }

  /**
   * Todos los catálogos de los desplegables en una sola llamada. Son listas
   * cortas; pedirlas una por una sería media docena de viajes al servidor por
   * cada reporte que se abre.
   */
  async options(tenantId: string): Promise<ReportOptions> {
    const [
      warehouses,
      users,
      categories,
      sizes,
      colors,
      banks,
      suppliers,
      brands,
    ] = await Promise.all([
      this.warehouseRepo.find({
        where: { tenantId },
        order: { name: 'ASC' },
      }),
      this.userRepo.find({ where: { tenantId }, order: { firstName: 'ASC' } }),
      this.categoryRepo.find({
        where: { tenantId },
        order: { name: 'ASC' },
      }),
      this.sizeRepo.find({
        where: { tenantId },
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
      this.colorRepo.find({ where: { tenantId }, order: { name: 'ASC' } }),
      this.bankRepo.find({ where: { tenantId }, order: { name: 'ASC' } }),
      this.supplierRepo.find({ where: { tenantId }, order: { name: 'ASC' } }),
      // La marca vive como texto en el producto, no como FK: las opciones
      // son los valores que de verdad hay.
      this.productRepo
        .createQueryBuilder('p')
        .select('DISTINCT p.brand', 'brand')
        .where('p.tenant_id = :tenantId', { tenantId })
        .andWhere("COALESCE(p.brand, '') <> ''")
        .orderBy('p.brand', 'ASC')
        .getRawMany(),
    ]);

    return {
      warehouses: warehouses.map((w) => ({ value: w.id, label: w.name })),
      users: users.map((u) => ({
        value: u.id,
        label: `${u.firstName} ${u.lastName}`.trim() || u.email,
      })),
      categories: categories.map((c) => ({ value: c.id, label: c.name })),
      brands: brands.map((b: { brand: string }) => ({
        value: b.brand,
        label: b.brand,
      })),
      sizes: sizes.map((s) => ({ value: s.id, label: s.name })),
      colors: colors.map((c) => ({ value: c.id, label: c.name })),
      banks: banks.map((b) => ({ value: b.id, label: b.name })),
      suppliers: suppliers.map((s) => ({ value: s.id, label: s.name })),
      paymentMethods: Object.values(PaymentMethod).map((m) => ({
        value: m,
        label: m.charAt(0) + m.slice(1).toLowerCase(),
      })),
      saleChannels: Object.values(SaleChannel).map((c) => ({
        value: c,
        label:
          c === SaleChannel.POS
            ? 'Punto de venta'
            : c === SaleChannel.WEB
              ? 'Tienda online'
              : 'WhatsApp',
      })),
    };
  }
}
