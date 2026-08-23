import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Expense } from './entities/expense.entity.js';
import { ExpenseCategory } from './entities/expense-category.entity.js';
import { PettyCash } from './entities/petty-cash.entity.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';
import { diaDeCalendario } from '../common/utils/dia-de-calendario.util.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import {
  CreateExpenseDto,
  CreateExpenseCategoryDto,
  CreatePettyCashDto,
  FundPettyCashDto,
} from './dto/expense.dto.js';

export interface PettyCashView extends PettyCash {
  /** Fondo + reposiciones − gastos pagados desde esta caja. */
  balance: number;
  spent: number;
}

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(ExpenseCategory)
    private readonly categoryRepo: Repository<ExpenseCategory>,
    @InjectRepository(PettyCash)
    private readonly pettyRepo: Repository<PettyCash>,
    @InjectRepository(Bank)
    private readonly bankRepo: Repository<Bank>,
  ) {}

  // ── Tipos de gasto ──

  async createCategory(
    dto: CreateExpenseCategoryDto,
    tenantId: string,
  ): Promise<ExpenseCategory> {
    const name = dto.name.trim();
    const dup = await this.categoryRepo.findOne({ where: { tenantId, name } });
    if (dup) {
      throw new ConflictException('Ya existe un tipo de gasto con ese nombre');
    }
    return this.categoryRepo.save(
      this.categoryRepo.create({
        name,
        description: dto.description ?? null,
        tenantId,
      }),
    );
  }

  async findCategories(tenantId: string): Promise<ExpenseCategory[]> {
    return this.categoryRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async removeCategory(
    id: string,
    tenantId: string,
  ): Promise<{ success: true }> {
    const category = await this.categoryRepo.findOne({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException('Tipo de gasto no encontrado');

    const inUse = await this.expenseRepo.count({
      where: { categoryId: id, tenantId },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `No se puede eliminar "${category.name}": lo usan ${inUse} gasto(s). Desactívalo en su lugar.`,
      );
    }
    await this.categoryRepo.delete({ id, tenantId });
    return { success: true };
  }

  // ── Gastos ──

  /** Consecutivo por el mayor emitido, nunca por el conteo (deja huecos). */
  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.expenseRepo
      .createQueryBuilder('e')
      .select(
        "MAX(CAST(substring(e.expense_number FROM '^GA-0*([0-9]+)$') AS integer))",
        'max',
      )
      .where('e.tenantId = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    return `GA-${String(Number(row?.max ?? 0) + 1).padStart(6, '0')}`;
  }

  async create(
    dto: CreateExpenseDto,
    userId: string,
    tenantId: string,
  ): Promise<Expense> {
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.EFECTIVO;
    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId, tenantId },
      });
      if (!category) throw new NotFoundException('Tipo de gasto no encontrado');
    }
    if (dto.pettyCashId) {
      const petty = await this.getPettyCash(dto.pettyCashId, tenantId);
      if (dto.amount > petty.balance) {
        throw new BadRequestException(
          `La caja menor "${petty.name}" solo tiene ${petty.balance} disponible.`,
        );
      }
      if (paymentMethod !== PaymentMethod.EFECTIVO || dto.bankId) {
        throw new BadRequestException(
          'Un gasto de caja menor debe registrarse en efectivo y sin banco.',
        );
      }
    }
    if (paymentMethod === PaymentMethod.EFECTIVO && dto.bankId) {
      throw new BadRequestException(
        'Un gasto en efectivo no debe tener banco. Quita el banco o cambia la forma de pago.',
      );
    }
    if (paymentMethod !== PaymentMethod.EFECTIVO && !dto.bankId) {
      throw new BadRequestException(
        'Selecciona el banco del que salió el dinero.',
      );
    }
    if (dto.bankId) {
      const bank = await this.bankRepo.findOne({
        where: { id: dto.bankId, tenantId, isActive: true },
      });
      if (!bank) {
        throw new NotFoundException('Banco no encontrado o inactivo');
      }
    }

    return retryOnUniqueViolation(async () =>
      this.expenseRepo.save(
        this.expenseRepo.create({
          expenseNumber: await this.nextNumber(tenantId),
          categoryId: dto.categoryId ?? null,
          warehouseId: dto.warehouseId ?? null,
          description: dto.description.trim(),
          amount: dto.amount,
          paymentMethod,
          bankId: dto.bankId ?? null,
          pettyCashId: dto.pettyCashId ?? null,
          expenseDate: diaDeCalendario(dto.expenseDate),
          notes: dto.notes?.trim() || null,
          createdById: userId,
          tenantId,
        }),
      ),
    );
  }

  async findAll(
    tenantId: string,
    filters?: { from?: string; to?: string; categoryId?: string },
  ): Promise<{ items: Expense[]; total: number }> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.from && filters?.to) {
      // Los dos extremos como día, por lo mismo: filtrar «del 1 al 31» con
      // instantes dejaba fuera el 31 en una zona y metía el 31 de julio en otra.
      //
      // Las fechas llegan de la barra de direcciones, así que una mal escrita
      // es un 400 y no un 500: el error es de quien preguntó, no nuestro.
      try {
        where.expenseDate = Between(
          diaDeCalendario(filters.from),
          diaDeCalendario(filters.to),
        );
      } catch {
        throw new BadRequestException(
          'Las fechas del filtro van como AAAA-MM-DD.',
        );
      }
    }
    const items = await this.expenseRepo.find({
      where,
      order: { expenseDate: 'DESC', createdAt: 'DESC' },
    });
    return {
      items,
      total: items.reduce((sum, e) => sum + Number(e.amount), 0),
    };
  }

  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const expense = await this.expenseRepo.findOne({ where: { id, tenantId } });
    if (!expense) throw new NotFoundException('Gasto no encontrado');
    await this.expenseRepo.delete({ id, tenantId });
    return { success: true };
  }

  // ── Caja menor ──

  async createPettyCash(
    dto: CreatePettyCashDto,
    tenantId: string,
  ): Promise<PettyCash> {
    return this.pettyRepo.save(
      this.pettyRepo.create({
        name: dto.name.trim(),
        warehouseId: dto.warehouseId ?? null,
        fundedAmount: dto.fundedAmount ?? 0,
        tenantId,
      }),
    );
  }

  /** El saldo se calcula, no se guarda: no puede quedar descuadrado. */
  private async withBalance(petty: PettyCash): Promise<PettyCashView> {
    const row = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'spent')
      .where('e.pettyCashId = :id', { id: petty.id })
      .andWhere('e.tenantId = :tenantId', { tenantId: petty.tenantId })
      .getRawOne<{ spent: string }>();
    const spent = Number(row?.spent ?? 0);
    return {
      ...petty,
      spent,
      balance: Number(petty.fundedAmount) - spent,
    };
  }

  async getPettyCash(id: string, tenantId: string): Promise<PettyCashView> {
    const petty = await this.pettyRepo.findOne({ where: { id, tenantId } });
    if (!petty) throw new NotFoundException('Caja menor no encontrada');
    return this.withBalance(petty);
  }

  async findPettyCash(tenantId: string): Promise<PettyCashView[]> {
    const all = await this.pettyRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
    return Promise.all(all.map((p) => this.withBalance(p)));
  }

  /** Repone el fondo: suma al asignado, que es como se maneja una caja menor. */
  async fundPettyCash(
    id: string,
    dto: FundPettyCashDto,
    tenantId: string,
  ): Promise<PettyCashView> {
    const petty = await this.pettyRepo.findOne({ where: { id, tenantId } });
    if (!petty) throw new NotFoundException('Caja menor no encontrada');
    petty.fundedAmount = Number(petty.fundedAmount) + dto.amount;
    await this.pettyRepo.save(petty);
    return this.getPettyCash(id, tenantId);
  }
}
