import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bank } from './entities/bank.entity.js';
import { CreateBankDto } from './dto/create-bank.dto.js';
import { UpdateBankDto } from './dto/update-bank.dto.js';

@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(Bank)
    private readonly bankRepository: Repository<Bank>,
  ) {}

  create(dto: CreateBankDto, tenantId: string): Promise<Bank> {
    const bank = this.bankRepository.create({ ...dto, tenantId });
    return this.bankRepository.save(bank);
  }

  findAll(tenantId: string): Promise<Bank[]> {
    return this.bankRepository.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Bank> {
    const bank = await this.bankRepository.findOne({ where: { id, tenantId } });
    if (!bank) throw new NotFoundException('Banco no encontrado');
    return bank;
  }

  async update(
    id: string,
    dto: UpdateBankDto,
    tenantId: string,
  ): Promise<Bank> {
    const bank = await this.findOne(id, tenantId);
    Object.assign(bank, dto);
    return this.bankRepository.save(bank);
  }

  async remove(id: string, tenantId: string): Promise<{ success: boolean }> {
    const bank = await this.findOne(id, tenantId);
    await this.bankRepository.remove(bank);
    return { success: true };
  }
}
