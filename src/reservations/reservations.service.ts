import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Reservation } from './entities/reservation.entity.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
  ) {}

  private async ensureEnabled(tenantId: string): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings?.reservationsEnabled) {
      throw new ForbiddenException(
        'Los separados no están habilitados para esta tienda',
      );
    }
  }

  async create(
    dto: CreateReservationDto,
    userId: string,
    tenantId: string,
  ): Promise<Reservation> {
    await this.ensureEnabled(tenantId);

    // Disponible en esa bodega = stock físico − apartados activos.
    const stock = await this.stockRepo.findOne({
      where: {
        variantId: dto.variantId,
        warehouseId: dto.warehouseId,
        tenantId,
      },
    });
    const physical = stock ? Number(stock.quantity) : 0;
    const reserved = await this.reservedQty(
      tenantId,
      dto.variantId,
      dto.warehouseId,
    );
    const available = physical - reserved;
    if (available < dto.quantity) {
      throw new BadRequestException(
        `No hay disponible para apartar. Disponible: ${available}, Solicitado: ${dto.quantity}`,
      );
    }

    const reservation = this.reservationRepo.create({
      variantId: dto.variantId,
      warehouseId: dto.warehouseId,
      quantity: dto.quantity,
      clientId: dto.clientId ?? null,
      clientName: dto.clientName ?? null,
      note: dto.note ?? null,
      status: 'ACTIVE',
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      createdById: userId,
      tenantId,
    });
    return this.reservationRepo.save(reservation);
  }

  // Suma de apartados ACTIVE de una variante (opcionalmente por bodega).
  async reservedQty(
    tenantId: string,
    variantId: string,
    warehouseId?: string,
  ): Promise<number> {
    const where: Record<string, unknown> = {
      tenantId,
      variantId,
      status: 'ACTIVE',
    };
    if (warehouseId) where.warehouseId = warehouseId;
    const rows = await this.reservationRepo.find({ where });
    return rows.reduce((sum, r) => sum + Number(r.quantity), 0);
  }

  async findActive(tenantId: string): Promise<Reservation[]> {
    return this.reservationRepo.find({
      where: { tenantId, status: 'ACTIVE' },
      relations: ['variant', 'variant.product', 'client'],
      order: { createdAt: 'DESC' },
    });
  }

  // Resumen: cantidad apartada activa por variante (para badges).
  async summary(tenantId: string): Promise<Record<string, number>> {
    const rows = await this.reservationRepo.find({
      where: { tenantId, status: 'ACTIVE' },
    });
    const map: Record<string, number> = {};
    for (const r of rows) {
      map[r.variantId] = (map[r.variantId] ?? 0) + Number(r.quantity);
    }
    return map;
  }

  async cancel(id: string, tenantId: string): Promise<Reservation> {
    const reservation = await this.reservationRepo.findOne({
      where: { id, tenantId },
    });
    if (!reservation) throw new NotFoundException('Apartado no encontrado');
    reservation.status = 'CANCELLED';
    return this.reservationRepo.save(reservation);
  }

  // Utilidad para tests / otros módulos: mapa reservado por variante.
  async reservedByVariants(
    tenantId: string,
    variantIds: string[],
  ): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const rows = await this.reservationRepo.find({
      where: { tenantId, status: 'ACTIVE', variantId: In(variantIds) },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.variantId, (map.get(r.variantId) ?? 0) + Number(r.quantity));
    }
    return map;
  }
}
