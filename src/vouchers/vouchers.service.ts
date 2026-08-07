import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Voucher, VoucherStatus } from './entities/voucher.entity.js';
import { CreateVoucherDto } from './dto/voucher.dto.js';
import { calculateCheckDigit } from '../inventory/barcode.util.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';

@Injectable()
export class VouchersService {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  /**
   * Código del bono: prefijo fijo + un aleatorio + dígito verificador.
   *
   * No se deriva del valor ni de un consecutivo a propósito: si fuera
   * predecible, cualquiera podría fabricar códigos de bonos válidos.
   */
  private generateBarcode(): string {
    const random = Math.floor(Math.random() * 1_000_000_000_000)
      .toString()
      .padStart(12, '0');
    const body = `21${random}`;
    return body + String(calculateCheckDigit(body));
  }

  async create(
    dto: CreateVoucherDto,
    userId: string,
    tenantId: string,
  ): Promise<Voucher[]> {
    const quantity = dto.quantity ?? 1;
    const created: Voucher[] = [];

    for (let i = 0; i < quantity; i++) {
      // El reintento cubre la colisión (improbable) de dos códigos aleatorios.
      const voucher = await retryOnUniqueViolation(async () =>
        this.voucherRepo.save(
          this.voucherRepo.create({
            barcode: this.generateBarcode(),
            amount: dto.amount,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            comment: dto.comment ?? null,
            createdById: userId,
            tenantId,
          }),
        ),
      );
      created.push(voucher);
    }
    return created;
  }

  async findAll(tenantId: string): Promise<Voucher[]> {
    return this.voucherRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Busca un bono por su código y comprueba que se pueda usar.
   *
   * Devuelve el motivo concreto cuando no sirve: el cajero tiene al cliente
   * enfrente y necesita poder explicarle qué pasa.
   */
  async findUsable(barcode: string, tenantId: string): Promise<Voucher> {
    const voucher = await this.voucherRepo.findOne({
      where: { barcode: (barcode || '').trim(), tenantId },
    });
    if (!voucher) {
      throw new NotFoundException('No existe un bono con ese código');
    }
    if (voucher.status === VoucherStatus.REDEEMED) {
      throw new BadRequestException(
        `Este bono ya fue canjeado${
          voucher.redeemedAt
            ? ` el ${voucher.redeemedAt.toLocaleDateString('es-CO')}`
            : ''
        }.`,
      );
    }
    if (voucher.status === VoucherStatus.DISABLED) {
      throw new BadRequestException('Este bono está desactivado.');
    }
    if (voucher.expiresAt && voucher.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        `Este bono venció el ${voucher.expiresAt.toLocaleDateString('es-CO')}.`,
      );
    }
    return voucher;
  }

  /**
   * Canjea el bono. Es de un solo uso: la actualización solo afecta a las
   * filas que **siguen activas**, así que dos cajas que lo escaneen a la vez
   * no pueden consumirlo dos veces.
   */
  async redeem(
    barcode: string,
    saleId: string | undefined,
    tenantId: string,
  ): Promise<Voucher> {
    const voucher = await this.findUsable(barcode, tenantId);

    const result = await this.voucherRepo
      .createQueryBuilder()
      .update(Voucher)
      .set({
        status: VoucherStatus.REDEEMED,
        redeemedAt: new Date(),
        redeemedSaleId: saleId ?? null,
      })
      .where('id = :id', { id: voucher.id })
      .andWhere('tenant_id = :tenantId', { tenantId })
      .andWhere('status = :status', { status: VoucherStatus.ACTIVE })
      .execute();

    if (!result.affected) {
      throw new BadRequestException(
        'Este bono acaba de ser canjeado en otra venta.',
      );
    }
    return this.voucherRepo.findOneOrFail({ where: { id: voucher.id } });
  }

  async setStatus(
    id: string,
    status: VoucherStatus,
    tenantId: string,
  ): Promise<Voucher> {
    const voucher = await this.voucherRepo.findOne({
      where: { id, tenantId },
    });
    if (!voucher) throw new NotFoundException('Bono no encontrado');
    if (voucher.status === VoucherStatus.REDEEMED) {
      throw new BadRequestException(
        'Un bono ya canjeado no puede cambiar de estado.',
      );
    }
    voucher.status = status;
    return this.voucherRepo.save(voucher);
  }

  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const voucher = await this.voucherRepo.findOne({
      where: { id, tenantId },
    });
    if (!voucher) throw new NotFoundException('Bono no encontrado');
    if (voucher.status === VoucherStatus.REDEEMED) {
      throw new BadRequestException(
        'No se puede eliminar un bono ya canjeado: quedaría sin rastro en la venta donde se usó.',
      );
    }
    await this.voucherRepo.delete({ id, tenantId });
    return { success: true };
  }
}
