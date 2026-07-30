import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { IncomeEntry } from './entities/income-entry.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import {
  IncomeType,
  IncomeCategory,
} from '../common/enums/income-type.enum.js';
import { CreateIncomeDto } from './dto/create-income.dto.js';
import { AdjustmentDto } from './dto/adjustment.dto.js';
import { TransferDto } from './dto/transfer.dto.js';

const NONE = '__none__';

interface Bucket {
  ventas: number;
  otros: number;
  balance: number;
}
const emptyBucket = (): Bucket => ({ ventas: 0, otros: 0, balance: 0 });

@Injectable()
export class IncomesService {
  constructor(
    @InjectRepository(IncomeEntry)
    private readonly entryRepository: Repository<IncomeEntry>,
    @InjectRepository(Bank)
    private readonly bankRepository: Repository<Bank>,
    private readonly dataSource: DataSource,
  ) {}

  createIncome(
    dto: CreateIncomeDto,
    userId: string,
    tenantId: string,
  ): Promise<IncomeEntry> {
    return this.entryRepository.save(
      this.entryRepository.create({
        type: IncomeType.INGRESO,
        category: IncomeCategory.OTROS,
        amount: dto.amount,
        method: dto.method,
        bankId: dto.bankId ?? null,
        note: dto.note,
        createdById: userId,
        tenantId,
      }),
    );
  }

  adjustment(
    dto: AdjustmentDto,
    userId: string,
    tenantId: string,
  ): Promise<IncomeEntry> {
    return this.entryRepository.save(
      this.entryRepository.create({
        type: IncomeType.AJUSTE,
        category: IncomeCategory.OTROS,
        amount: dto.amount,
        method: dto.method,
        bankId: dto.bankId ?? null,
        note: dto.note,
        createdById: userId,
        tenantId,
      }),
    );
  }

  transfer(
    dto: TransferDto,
    userId: string,
    tenantId: string,
  ): Promise<IncomeEntry> {
    return this.entryRepository.save(
      this.entryRepository.create({
        type: IncomeType.TRANSFERENCIA,
        category: IncomeCategory.OTROS,
        amount: dto.amount,
        method: dto.method,
        bankId: dto.bankId ?? null,
        targetMethod: dto.targetMethod,
        targetBankId: dto.targetBankId ?? null,
        note: dto.note,
        createdById: userId,
        tenantId,
      }),
    );
  }

  async listEntries(tenantId: string): Promise<IncomeEntry[]> {
    return this.entryRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 300,
    });
  }

  async remove(id: string, tenantId: string): Promise<{ success: boolean }> {
    await this.entryRepository.delete({ id, tenantId });
    return { success: true };
  }

  // Resumen de tesorería: ingresos (VENTAS derivadas de pagos + abonos, OTROS
  // manuales) y saldos por banco y por método, incluyendo ajustes y
  // transferencias. Filtro opcional por fechas (aplica a todo).
  async getSummary(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<unknown> {
    const banks = await this.bankRepository.find({ where: { tenantId } });
    const bankName = new Map<string, string>(banks.map((b) => [b.id, b.name]));

    const params: unknown[] = [tenantId];
    let saleDate = '';
    let arDate = '';
    let entryDate = '';
    if (from && to) {
      params.push(from, to);
      saleDate = ' AND s.created_at BETWEEN $2 AND $3';
      arDate = ' AND arp.created_at BETWEEN $2 AND $3';
      entryDate = ' AND e.created_at BETWEEN $2 AND $3';
    }

    // VENTAS: pagos de ventas no anuladas, excluyendo CREDITO (aún no es dinero
    // recibido; entra cuando se abona).
    const salesRows: { method: string; bankId: string | null; total: string }[] =
      await this.dataSource.query(
        `SELECT p.method, p.bank_id AS "bankId", SUM(p.amount)::numeric AS total
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE p.tenant_id = $1 AND s.status <> 'CANCELLED' AND p.method <> 'CREDITO'${saleDate}
         GROUP BY p.method, p.bank_id`,
        params,
      );

    // VENTAS: abonos a cuentas por cobrar (dinero recibido de ventas a crédito).
    const abonoRows: { method: string; bankId: string | null; total: string }[] =
      await this.dataSource.query(
        `SELECT arp.method, arp.bank_id AS "bankId", SUM(arp.amount)::numeric AS total
         FROM accounts_receivable_payments arp
         WHERE arp.tenant_id = $1${arDate}
         GROUP BY arp.method, arp.bank_id`,
        params,
      );

    // Movimientos manuales.
    const entryRows: {
      type: string;
      method: string | null;
      bankId: string | null;
      targetMethod: string | null;
      targetBankId: string | null;
      amount: string;
    }[] = await this.dataSource.query(
      `SELECT e.type, e.method, e.bank_id AS "bankId",
              e.target_method AS "targetMethod", e.target_bank_id AS "targetBankId",
              e.amount
       FROM income_entries e
       WHERE e.tenant_id = $1${entryDate}`,
      params,
    );

    const byBank = new Map<string, Bucket>();
    const byMethod = new Map<string, Bucket>();
    const bank = (k: string | null) => {
      const key = k ?? NONE;
      if (!byBank.has(key)) byBank.set(key, emptyBucket());
      return byBank.get(key)!;
    };
    const meth = (k: string | null) => {
      const key = k ?? NONE;
      if (!byMethod.has(key)) byMethod.set(key, emptyBucket());
      return byMethod.get(key)!;
    };

    let ventas = 0;
    let otros = 0;
    let ajustes = 0;

    const addVentas = (bankId: string | null, method: string, n: number) => {
      ventas += n;
      const b = bank(bankId);
      b.ventas += n;
      b.balance += n;
      const m = meth(method);
      m.ventas += n;
      m.balance += n;
    };

    for (const r of salesRows) addVentas(r.bankId, r.method, Number(r.total));
    for (const r of abonoRows) addVentas(r.bankId, r.method, Number(r.total));

    for (const e of entryRows) {
      const amt = Number(e.amount);
      if (e.type === IncomeType.INGRESO) {
        otros += amt;
        const b = bank(e.bankId);
        b.otros += amt;
        b.balance += amt;
        const m = meth(e.method);
        m.otros += amt;
        m.balance += amt;
      } else if (e.type === IncomeType.AJUSTE) {
        ajustes += amt;
        bank(e.bankId).balance += amt;
        meth(e.method).balance += amt;
      } else if (e.type === IncomeType.TRANSFERENCIA) {
        bank(e.bankId).balance -= amt;
        bank(e.targetBankId).balance += amt;
        meth(e.method).balance -= amt;
        meth(e.targetMethod).balance += amt;
      }
    }

    const bankLabel = (key: string) =>
      key === NONE ? 'Sin banco' : (bankName.get(key) ?? 'Banco eliminado');
    const methodLabel = (key: string) => (key === NONE ? 'Sin método' : key);

    return {
      totals: {
        ventas,
        otros,
        ingresos: ventas + otros,
        balance: ventas + otros + ajustes,
      },
      byBank: Array.from(byBank.entries()).map(([key, v]) => ({
        bankId: key === NONE ? null : key,
        bankName: bankLabel(key),
        ventas: v.ventas,
        otros: v.otros,
        ingresos: v.ventas + v.otros,
        balance: v.balance,
      })),
      byMethod: Array.from(byMethod.entries()).map(([key, v]) => ({
        method: key === NONE ? null : key,
        methodLabel: methodLabel(key),
        ventas: v.ventas,
        otros: v.otros,
        ingresos: v.ventas + v.otros,
        balance: v.balance,
      })),
    };
  }
}
