import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consignment } from './entities/consignment.entity.js';
import { ThirdPartyProduct } from './entities/third-party-product.entity.js';
import { claveDeProducto } from './producto-de-tercero.js';
import { CreateConsignmentDto } from './dto/create-consignment.dto.js';
import { UpdateConsignmentDto } from './dto/update-consignment.dto.js';

export interface ConsignmentFilters {
  thirdParty?: string;
  clientPaid?: boolean;
  supplierPaid?: boolean;
}

@Injectable()
export class ConsignmentsService {
  constructor(
    @InjectRepository(Consignment)
    private readonly repo: Repository<Consignment>,
    @InjectRepository(ThirdPartyProduct)
    private readonly libretaRepo: Repository<ThirdPartyProduct>,
  ) {}

  async create(
    dto: CreateConsignmentDto,
    tenantId: string,
  ): Promise<Consignment> {
    const entity = this.repo.create({
      thirdPartyName: dto.thirdPartyName.trim(),
      productDescription: dto.productDescription.trim(),
      size: dto.size?.trim() || '',
      color: dto.color?.trim() || '',
      quantity: dto.quantity ?? 1,
      costPrice: dto.costPrice,
      salePrice: dto.salePrice,
      clientName: dto.clientName?.trim() || '',
      clientPaid: dto.clientPaid ?? false,
      supplierPaid: dto.supplierPaid ?? false,
      paymentMethod: dto.paymentMethod?.trim() || '',
      saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
      notes: dto.notes?.trim() || undefined,
      tenantId,
    });
    const guardada = await this.repo.save(entity);
    await this.anotarEnLaLibreta(guardada);
    return guardada;
  }

  /**
   * Deja el producto anotado para la proxima vez.
   *
   * No falla la venta si esto falla: la venta es el hecho, la libreta es una
   * comodidad. Perder la comodidad no puede costar el registro de la plata.
   */
  private async anotarEnLaLibreta(venta: Consignment): Promise<void> {
    try {
      const clave = claveDeProducto(venta);
      const ya = await this.libretaRepo.findOne({
        where: { tenantId: venta.tenantId, clave },
      });
      const cuando = venta.saleDate ?? new Date();
      if (ya) {
        // Lo **ultimo**, no un promedio: quien revende compra cada semana a
        // otro precio, y lo que sirve para la proxima venta es lo de la vez
        // pasada.
        ya.lastCostPrice = venta.costPrice;
        ya.lastSalePrice = venta.salePrice;
        ya.timesSold += 1;
        ya.lastSoldAt = cuando;
        await this.libretaRepo.save(ya);
        return;
      }
      await this.libretaRepo.save(
        this.libretaRepo.create({
          tenantId: venta.tenantId,
          clave,
          thirdPartyName: venta.thirdPartyName,
          productDescription: venta.productDescription,
          size: venta.size || '',
          color: venta.color || '',
          lastCostPrice: venta.costPrice,
          lastSalePrice: venta.salePrice,
          timesSold: 1,
          lastSoldAt: cuando,
        }),
      );
    } catch {
      // Dos cajas registrando el mismo par a la vez chocan contra el indice
      // unico. La segunda no tiene nada que arreglar: el producto ya quedo.
    }
  }

  /** La libreta: lo que ya se vendio, para no volver a escribirlo. */
  async productos(
    tenantId: string,
    filtros: { q?: string; thirdParty?: string; limit?: number } = {},
  ): Promise<ThirdPartyProduct[]> {
    const qb = this.libretaRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId });
    if (filtros.thirdParty) {
      qb.andWhere('p.third_party_name ILIKE :duenyo', {
        duenyo: `%${filtros.thirdParty}%`,
      });
    }
    if (filtros.q) {
      qb.andWhere(
        '(p.product_description ILIKE :q OR p.third_party_name ILIKE :q)',
        { q: `%${filtros.q}%` },
      );
    }
    // Lo que mas se vende primero: en el mostrador, lo de siempre esta arriba.
    return qb
      .orderBy('p.times_sold', 'DESC')
      .addOrderBy('p.last_sold_at', 'DESC')
      .limit(Math.min(filtros.limit ?? 50, 200))
      .getMany();
  }

  async findAll(
    tenantId: string,
    filters: ConsignmentFilters = {},
  ): Promise<Consignment[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (filters.thirdParty) {
      qb.andWhere('c.thirdPartyName ILIKE :tp', {
        tp: `%${filters.thirdParty}%`,
      });
    }
    if (filters.clientPaid !== undefined) {
      qb.andWhere('c.clientPaid = :cp', { cp: filters.clientPaid });
    }
    if (filters.supplierPaid !== undefined) {
      qb.andWhere('c.supplierPaid = :sp', { sp: filters.supplierPaid });
    }
    return qb
      .orderBy('c.saleDate', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: string, tenantId: string): Promise<Consignment> {
    const item = await this.repo.findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Venta de tercero no encontrada');
    return item;
  }

  async update(
    id: string,
    dto: UpdateConsignmentDto,
    tenantId: string,
  ): Promise<Consignment> {
    const item = await this.findOne(id, tenantId);
    if (dto.thirdPartyName !== undefined)
      item.thirdPartyName = dto.thirdPartyName.trim();
    if (dto.productDescription !== undefined)
      item.productDescription = dto.productDescription.trim();
    if (dto.size !== undefined) item.size = dto.size.trim();
    if (dto.color !== undefined) item.color = dto.color.trim();
    if (dto.quantity !== undefined) item.quantity = dto.quantity;
    if (dto.costPrice !== undefined) item.costPrice = dto.costPrice;
    if (dto.salePrice !== undefined) item.salePrice = dto.salePrice;
    if (dto.clientName !== undefined) item.clientName = dto.clientName.trim();
    if (dto.clientPaid !== undefined) item.clientPaid = dto.clientPaid;
    if (dto.supplierPaid !== undefined) item.supplierPaid = dto.supplierPaid;
    if (dto.paymentMethod !== undefined)
      item.paymentMethod = dto.paymentMethod.trim();
    if (dto.saleDate !== undefined) item.saleDate = new Date(dto.saleDate);
    if (dto.notes !== undefined) item.notes = dto.notes.trim();
    return this.repo.save(item);
  }

  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const item = await this.findOne(id, tenantId);
    await this.repo.remove(item);
    return { success: true };
  }

  /**
   * Resumen: utilidad total, cuánto te deben los clientes (CxC) y cuánto le
   * debes a los terceros (CxP), + desglose por tercero.
   */
  async summary(tenantId: string): Promise<{
    count: number;
    totalSale: number;
    totalCost: number;
    totalProfit: number;
    owedByClients: number;
    owedToThirdParties: number;
    byThirdParty: {
      thirdPartyName: string;
      count: number;
      profit: number;
      owedToThem: number;
    }[];
  }> {
    const rows = await this.repo.find({ where: { tenantId } });
    let totalSale = 0;
    let totalCost = 0;
    let owedByClients = 0;
    let owedToThirdParties = 0;
    const byTp = new Map<
      string,
      {
        thirdPartyName: string;
        count: number;
        profit: number;
        owedToThem: number;
      }
    >();
    for (const r of rows) {
      const qty = r.quantity || 1;
      const sale = Number(r.salePrice) * qty;
      const cost = Number(r.costPrice) * qty;
      totalSale += sale;
      totalCost += cost;
      if (!r.clientPaid) owedByClients += sale;
      if (!r.supplierPaid) owedToThirdParties += cost;
      const key = r.thirdPartyName || '(sin nombre)';
      const agg = byTp.get(key) || {
        thirdPartyName: key,
        count: 0,
        profit: 0,
        owedToThem: 0,
      };
      agg.count += 1;
      agg.profit += sale - cost;
      if (!r.supplierPaid) agg.owedToThem += cost;
      byTp.set(key, agg);
    }
    return {
      count: rows.length,
      totalSale,
      totalCost,
      totalProfit: totalSale - totalCost,
      owedByClients,
      owedToThirdParties,
      byThirdParty: [...byTp.values()].sort((a, b) => b.profit - a.profit),
    };
  }

  /** Nombres de terceros distintos (para autocompletar). */
  async thirdParties(tenantId: string): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('DISTINCT c.thirdPartyName', 'name')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere("c.thirdPartyName <> ''")
      .orderBy('name', 'ASC')
      .getRawMany<{ name: string }>();
    return rows.map((r) => r.name);
  }
}
