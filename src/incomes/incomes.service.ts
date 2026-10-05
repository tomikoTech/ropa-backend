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
import { Paginated } from '../common/types/paginated.js';
import { resolverPagina, armarPaginado } from '../common/utils/paginacion.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { rangoEfectivo, type RangoEfectivo } from './desde-cuando.js';
import { rangoUtcDelDia } from '../caja/cuadre.js';

const NONE = '__none__';

interface Bucket {
  ventas: number;
  otros: number;
  egresos: number;
  balance: number;
}
const emptyBucket = (): Bucket => ({
  ventas: 0,
  otros: 0,
  egresos: 0,
  balance: 0,
});

@Injectable()
export class IncomesService {
  constructor(
    @InjectRepository(IncomeEntry)
    private readonly entryRepository: Repository<IncomeEntry>,
    @InjectRepository(Bank)
    private readonly bankRepository: Repository<Bank>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepository: Repository<StoreSettings>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Desde cuándo cuenta la tesorería de esta tienda, recortando el rango que
   * pidió la pantalla. Ver `desde-cuando.ts`.
   */
  private async rango(
    tenantId: string,
    pedido: { from?: string; to?: string } = {},
  ): Promise<RangoEfectivo> {
    const settings = await this.settingsRepository.findOne({
      where: { tenantId },
      select: { id: true, tesoreriaDesde: true },
    });
    return rangoEfectivo(settings?.tesoreriaDesde ?? null, pedido);
  }

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
    const entry = this.entryRepository.create({
      type: IncomeType.AJUSTE,
      category: IncomeCategory.OTROS,
      amount: dto.amount,
      method: dto.method,
      bankId: dto.bankId ?? null,
      note: dto.note,
      createdById: userId,
      tenantId,
    });
    if (dto.fecha) {
      // El saldo inicial se carga «al 1 de octubre». La tabla solo tiene
      // `created_at` (timestamptz), así que el día elegido se guarda al
      // mediodía de Colombia: cae dentro de ese día se mire desde donde se
      // mire, y queda por encima del piso de `tesoreriaDesde` si es el mismo.
      const { desde } = rangoUtcDelDia(dto.fecha);
      entry.createdAt = new Date(desde.getTime() + 12 * 60 * 60 * 1000);
    }
    return this.entryRepository.save(entry);
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

  /**
   * Los movimientos manuales, por página. Antes se traían 300 y el navegador
   * filtraba por fecha y por texto; ahora el filtro viaja al servidor.
   */
  async listEntriesPaginado(
    tenantId: string,
    opts: {
      page?: string | number | null;
      limit?: string | number | null;
      search?: string;
      from?: string;
      to?: string;
    },
  ): Promise<Paginated<IncomeEntry>> {
    const pagina = resolverPagina(opts, { limitDefault: 50, limitMax: 200 });

    const qb = this.entryRepository
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId', { tenantId });

    const search = opts.search?.trim();
    if (search) {
      // El navegador buscaba sobre `categoria + nota`; se replica igual.
      qb.andWhere('(e.category ILIKE :q OR e.note ILIKE :q)', {
        q: `%${search}%`,
      });
    }
    const rango = await this.rango(tenantId, opts);
    if (rango.desde)
      qb.andWhere('e.created_at >= :desde', { desde: rango.desde });
    if (rango.hasta)
      qb.andWhere('e.created_at <= :hasta', { hasta: rango.hasta });

    const [data, total] = await qb
      .orderBy('e.created_at', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit)
      .getManyAndCount();

    return armarPaginado(data, total, pagina);
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

    // El rango pedido, recortado a `tesoreriaDesde`: lo anterior no cuenta.
    const rango = await this.rango(tenantId, { from, to });
    const params: unknown[] = [tenantId];
    let saleDate = '';
    let arDate = '';
    let entryDate = '';
    let expenseDate = '';
    if (rango.desde) {
      params.push(rango.desde);
      const n = params.length;
      saleDate += ` AND s.created_at >= $${n}`;
      arDate += ` AND arp.created_at >= $${n}`;
      entryDate += ` AND e.created_at >= $${n}`;
      // Los gastos guardan un día, no un instante: se compara con el día
      // colombiano del piso, que es el que la tienda configuró.
      expenseDate += ` AND ex.expense_date >= ($${n}::timestamptz AT TIME ZONE 'America/Bogota')::date`;
    }
    if (rango.hasta) {
      params.push(rango.hasta);
      const n = params.length;
      saleDate += ` AND s.created_at <= $${n}`;
      arDate += ` AND arp.created_at <= $${n}`;
      entryDate += ` AND e.created_at <= $${n}`;
      expenseDate += ` AND ex.expense_date <= ($${n}::timestamptz AT TIME ZONE 'America/Bogota')::date`;
    }

    // VENTAS: pagos de ventas no anuladas, excluyendo CREDITO (aún no es dinero
    // recibido; entra cuando se abona).
    const salesRows: {
      method: string;
      bankId: string | null;
      total: string;
    }[] = await this.dataSource.query(
      `SELECT p.method, p.bank_id AS "bankId", SUM(p.amount)::numeric AS total
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE p.tenant_id = $1 AND s.status <> 'CANCELLED' AND p.method <> 'CREDITO'${saleDate}
         GROUP BY p.method, p.bank_id`,
      params,
    );

    // VENTAS: abonos a cuentas por cobrar (dinero recibido de ventas a crédito).
    const abonoRows: {
      method: string;
      bankId: string | null;
      total: string;
    }[] = await this.dataSource.query(
      `SELECT arp.method, arp.bank_id AS "bankId", SUM(arp.amount)::numeric AS total
         FROM accounts_receivable_payments arp
         WHERE arp.tenant_id = $1${arDate}
         GROUP BY arp.method, arp.bank_id`,
      params,
    );

    // Movimientos manuales.
    const entryRows: {
      type: IncomeType;
      category: IncomeCategory;
      method: string | null;
      bankId: string | null;
      targetMethod: string | null;
      targetBankId: string | null;
      amount: string;
    }[] = await this.dataSource.query(
      `SELECT e.type, e.category, e.method, e.bank_id AS "bankId",
              e.target_method AS "targetMethod", e.target_bank_id AS "targetBankId",
              e.amount
       FROM income_entries e
       WHERE e.tenant_id = $1${entryDate}`,
      params,
    );

    // EGRESOS: reducen el saldo del mismo método/banco del que salió el
    // dinero. Los registros históricos sin método se consideran efectivo,
    // que era el comportamiento implícito antes de exponer el campo en UI.
    const expenseRows: {
      method: string;
      bankId: string | null;
      total: string;
    }[] = await this.dataSource.query(
      `SELECT COALESCE(ex.payment_method, 'EFECTIVO') AS method,
              ex.bank_id AS "bankId", SUM(ex.amount)::numeric AS total
       FROM expenses ex
       WHERE ex.tenant_id = $1${expenseDate}
       GROUP BY COALESCE(ex.payment_method, 'EFECTIVO'), ex.bank_id`,
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
    let egresos = 0;

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

    for (const expense of expenseRows) {
      const amount = Number(expense.total);
      egresos += amount;
      const b = bank(expense.bankId);
      b.egresos += amount;
      b.balance -= amount;
      const m = meth(expense.method);
      m.egresos += amount;
      m.balance -= amount;
    }

    for (const e of entryRows) {
      const amt = Number(e.amount);
      if (e.type === IncomeType.INGRESO) {
        if (e.category === IncomeCategory.VENTAS) {
          addVentas(e.bankId, e.method ?? 'EFECTIVO', amt);
        } else {
          otros += amt;
          const b = bank(e.bankId);
          b.otros += amt;
          b.balance += amt;
          const m = meth(e.method);
          m.otros += amt;
          m.balance += amt;
        }
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
      desde: rango.tesoreriaDesde,
      aviso: rango.aviso,
      totals: {
        ventas,
        otros,
        ingresos: ventas + otros,
        egresos,
        balance: ventas + otros + ajustes - egresos,
      },
      byBank: Array.from(byBank.entries()).map(([key, v]) => ({
        bankId: key === NONE ? null : key,
        bankName: bankLabel(key),
        ventas: v.ventas,
        otros: v.otros,
        ingresos: v.ventas + v.otros,
        egresos: v.egresos,
        balance: v.balance,
      })),
      byMethod: Array.from(byMethod.entries()).map(([key, v]) => ({
        method: key === NONE ? null : key,
        methodLabel: methodLabel(key),
        ventas: v.ventas,
        otros: v.otros,
        ingresos: v.ventas + v.otros,
        egresos: v.egresos,
        balance: v.balance,
      })),
    };
  }
}
