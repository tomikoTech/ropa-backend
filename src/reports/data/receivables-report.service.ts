import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsReceivable } from '../../pos/entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from '../../pos/entities/accounts-receivable-payment.entity.js';
import { AccountsPayable } from '../../purchases/entities/accounts-payable.entity.js';
import { AccountsPayablePayment } from '../../purchases/entities/accounts-payable-payment.entity.js';
import { Payment } from '../../pos/entities/payment.entity.js';
import { Expense } from '../../expenses/entities/expense.entity.js';
import { Bank } from '../../banks/entities/bank.entity.js';
import {
  dateRangeSql,
  localDaySql,
  money,
  naiveDaySql,
  naiveTimestampRangeSql,
  timestampRangeSql,
} from '../engine/report-filters.js';
import type {
  RawRow,
  ReportQuery,
  ReportResult,
} from '../engine/report-types.js';
import { diaDeCalendario } from '../../common/utils/dia-de-calendario.util.js';
import { diasDeMora } from '../../common/utils/vencimiento.js';

const MAX_ROWS = 20000;
const MODES = ['cobrar', 'pagar', 'bancos'] as const;

interface CashRow {
  // La firma de índice lo hace compatible con la fila genérica del reporte.
  [key: string]: string | number;
  fecha: string;
  tipo: string;
  concepto: string;
  metodo: string;
  banco: string;
  referencia: string;
  entrada: number;
  salida: number;
}

/**
 * Cartera y bancos.
 *
 * El saldo **se calcula** (total menos abonos) en vez de guardarse: una
 * columna "saldo" se desincroniza en cuanto alguien edita un abono, y después
 * nadie sabe cuál de los dos números es el bueno.
 */
@Injectable()
export class ReceivablesReportService {
  constructor(
    @InjectRepository(AccountsReceivable)
    private readonly arRepo: Repository<AccountsReceivable>,
    @InjectRepository(AccountsPayable)
    private readonly apRepo: Repository<AccountsPayable>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(AccountsReceivablePayment)
    private readonly arPayRepo: Repository<AccountsReceivablePayment>,
    @InjectRepository(AccountsPayablePayment)
    private readonly apPayRepo: Repository<AccountsPayablePayment>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(Bank)
    private readonly bankRepo: Repository<Bank>,
  ) {}

  run(query: ReportQuery, tenantId: string): Promise<ReportResult> {
    const mode = query.pick('mode', MODES, 'cobrar');
    if (mode === 'pagar') return this.payable(query, tenantId);
    if (mode === 'bancos') return this.cashByBank(query, tenantId);
    return this.receivable(query, tenantId);
  }

  /**
   * Días de mora; 0 si aún no vence o ya está pagada.
   *
   * La aritmética vive en `vencimiento.ts` y se prueba sin base de datos.
   *
   * **Este no era el sitio del bug, y conviene decirlo.** Lo de antes
   * —restar milisegundos contra `Date.now()`— daba el mismo número, pero solo
   * porque el driver devuelve una columna `date` como `Date` a medianoche
   * **local**. Si esa fila llegara como texto `2026-08-23`, `new Date` la
   * leería como medianoche UTC y desde las 7 p. m. la cuenta ya sumaría un día
   * de mora el mismo día en que se quedó de pagar. Y bajo un horario de verano
   * se pierde un día en cada tramo largo.
   *
   * Dos líneas más arriba, la columna «Vence» sí se rompió por confiar en ese
   * mismo detalle del driver. Por eso el cálculo ya no depende de él.
   */
  private overdueDays(
    dueDate: string | number | boolean | null | undefined,
    saldo: number,
  ): number {
    if (saldo <= 0 || typeof dueDate === 'boolean' || typeof dueDate === 'number')
      return 0;
    return diasDeMora(dueDate, diaDeCalendario());
  }

  /**
   * El día del vencimiento como texto, `AAAA-MM-DD`.
   *
   * `getRawMany` no pasa por TypeORM, así que una columna `date` llega como
   * `Date` y `String(fecha).slice(0, 10)` daba «Tue Aug 11»: en inglés, con el
   * día de la semana en vez del año, y corrido. Así salía impresa la columna
   * «Vence» del reporte de cartera.
   */
  private diaDeVencimiento(
    vence: string | number | boolean | null | undefined | Date,
  ): string {
    if (!vence || typeof vence === 'boolean' || typeof vence === 'number') {
      return '—';
    }
    try {
      return diaDeCalendario(vence);
    } catch {
      return '—';
    }
  }

  private status(total: number, abonado: number): string {
    if (abonado >= total && total > 0) return 'Pagada';
    if (abonado > 0) return 'Parcial';
    return 'Pendiente';
  }

  // ── Por cobrar ───────────────────────────────────────────────────────────

  private async receivable(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.arRepo
      .createQueryBuilder('ar')
      .innerJoin('ar.client', 'cl')
      .leftJoin('ar.sale', 's')
      .where('ar.tenant_id = :tenantId', { tenantId })
      // La cartera de una venta anulada no se cobra: no es cartera.
      .andWhere("(s.status IS NULL OR s.status <> 'CANCELLED')")
      .andWhere(timestampRangeSql('ar.created_at'), {
        from: query.from,
        to: query.to,
      });

    if (query.flag('onlyOpen')) qb.andWhere('ar.is_fully_paid = false');
    const search = query.text('search');
    if (search) {
      qb.andWhere(
        "((COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, '')) ILIKE :q" +
          ' OR cl.document_number ILIKE :q OR s.sale_number ILIKE :q' +
          ' OR s.invoice_number ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    const raw = await qb
      .select(localDaySql('ar.created_at'), 'fecha')
      .addSelect('ar.due_date', 'vence')
      .addSelect("COALESCE(s.sale_number, '—')", 'venta')
      .addSelect("COALESCE(s.invoice_number, '—')", 'factura')
      .addSelect(
        "TRIM(COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, ''))",
        'cliente',
      )
      .addSelect("COALESCE(cl.document_number, '—')", 'documento')
      .addSelect('ar.total_amount', 'total')
      .addSelect('ar.paid_amount', 'abonado')
      .orderBy('ar.due_date', 'ASC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const rows = raw.map((r) => {
      const total = money(r.total);
      const abonado = money(r.abonado);
      const saldo = money(total - abonado);
      return {
        fecha: String(r.fecha ?? ''),
        vence: this.diaDeVencimiento(r.vence),
        venta: String(r.venta ?? ''),
        factura: String(r.factura ?? ''),
        cliente: String(r.cliente ?? '').trim() || '—',
        documento: String(r.documento ?? ''),
        total,
        abonado,
        saldo,
        estado: this.status(total, abonado),
        mora: this.overdueDays(r.vence, saldo),
      };
    });

    const saldo = money(rows.reduce((s, r) => s + r.saldo, 0));
    const vencido = money(
      rows.filter((r) => r.mora > 0).reduce((s, r) => s + r.saldo, 0),
    );

    return {
      columns: [
        { key: 'fecha', label: 'Fecha', type: 'date' },
        { key: 'vence', label: 'Vence', type: 'date' },
        { key: 'venta', label: 'Venta', type: 'text' },
        { key: 'factura', label: 'Factura', type: 'text' },
        { key: 'cliente', label: 'Cliente', type: 'text' },
        { key: 'documento', label: 'Documento', type: 'text' },
        { key: 'total', label: 'Total', type: 'money' },
        { key: 'abonado', label: 'Abonado', type: 'money' },
        { key: 'saldo', label: 'Saldo', type: 'money' },
        { key: 'estado', label: 'Estado', type: 'text' },
        {
          key: 'mora',
          label: 'Días de mora',
          type: 'number',
          hint: '0 = al día o ya pagada',
        },
      ],
      rows,
      totals: [
        {
          key: 'cuentas',
          label: 'Cuentas',
          type: 'number',
          value: rows.length,
        },
        {
          key: 'total',
          label: 'Facturado a crédito',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.total, 0)),
        },
        {
          key: 'abonado',
          label: 'Abonado',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.abonado, 0)),
        },
        { key: 'saldo', label: 'Por cobrar', type: 'money', value: saldo },
        {
          key: 'vencido',
          label: 'Vencido',
          type: 'money',
          value: vencido,
          hint: 'Saldo de las cuentas que ya pasaron su fecha',
        },
      ],
      title: `Cuentas por cobrar ${query.from} a ${query.to}`,
      warnings: [],
    };
  }

  // ── Por pagar ────────────────────────────────────────────────────────────

  private async payable(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const qb = this.apRepo
      .createQueryBuilder('ap')
      .innerJoin('ap.purchaseOrder', 'po')
      .innerJoin('po.supplier', 'sp')
      .where('ap.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('ap.created_at'), {
        from: query.from,
        to: query.to,
      });

    if (query.flag('onlyOpen')) qb.andWhere('ap.is_paid = false');
    const supplierId = query.uuid('supplierId');
    if (supplierId) qb.andWhere('po.supplier_id = :supplierId', { supplierId });
    const search = query.text('search');
    if (search) {
      qb.andWhere(
        '(sp.name ILIKE :q OR po.order_number ILIKE :q' +
          ' OR po.supplier_invoice_number ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    const raw = await qb
      .select(localDaySql('ap.created_at'), 'fecha')
      .addSelect('ap.due_date', 'vence')
      .addSelect('po.order_number', 'orden')
      .addSelect("COALESCE(po.supplier_invoice_number, '—')", 'factura')
      .addSelect('sp.name', 'proveedor')
      .addSelect('ap.amount', 'total')
      .addSelect('ap.paid_amount', 'abonado')
      .orderBy('ap.due_date', 'ASC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    const rows = raw.map((r) => {
      const total = money(r.total);
      const abonado = money(r.abonado);
      const saldo = money(total - abonado);
      return {
        fecha: String(r.fecha ?? ''),
        vence: this.diaDeVencimiento(r.vence),
        orden: String(r.orden ?? ''),
        factura: String(r.factura ?? ''),
        proveedor: String(r.proveedor ?? ''),
        total,
        abonado,
        saldo,
        estado: this.status(total, abonado),
        mora: this.overdueDays(r.vence, saldo),
      };
    });

    // Cuánto se le debe a cada proveedor, que es la pregunta real de este
    // reporte: la lista de facturas no la responde de un vistazo.
    const porProveedor = new Map<string, number>();
    for (const r of rows) {
      porProveedor.set(
        r.proveedor,
        money((porProveedor.get(r.proveedor) ?? 0) + r.saldo),
      );
    }
    const mayor = [...porProveedor.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      columns: [
        { key: 'fecha', label: 'Fecha', type: 'date' },
        { key: 'vence', label: 'Vence', type: 'date' },
        { key: 'orden', label: 'Orden', type: 'text' },
        { key: 'factura', label: 'Factura proveedor', type: 'text' },
        { key: 'proveedor', label: 'Proveedor', type: 'text' },
        { key: 'total', label: 'Total', type: 'money' },
        { key: 'abonado', label: 'Abonado', type: 'money' },
        { key: 'saldo', label: 'Saldo', type: 'money' },
        { key: 'estado', label: 'Estado', type: 'text' },
        { key: 'mora', label: 'Días de mora', type: 'number' },
      ],
      rows,
      totals: [
        {
          key: 'cuentas',
          label: 'Cuentas',
          type: 'number',
          value: rows.length,
        },
        {
          key: 'total',
          label: 'Comprado a crédito',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.total, 0)),
        },
        {
          key: 'saldo',
          label: 'Por pagar',
          type: 'money',
          value: money(rows.reduce((s, r) => s + r.saldo, 0)),
        },
        {
          key: 'vencido',
          label: 'Vencido',
          type: 'money',
          value: money(
            rows.filter((r) => r.mora > 0).reduce((s, r) => s + r.saldo, 0),
          ),
        },
        {
          key: 'mayorDeuda',
          label: 'Mayor deuda',
          type: 'text',
          value: mayor ? `${mayor[0]}` : '—',
          hint: mayor
            ? `$${mayor[1].toLocaleString('es-CO')} pendientes`
            : undefined,
        },
      ],
      title: `Cuentas por pagar ${query.from} a ${query.to}`,
      warnings: [],
    };
  }

  // ── Movimiento por banco y método ────────────────────────────────────────

  /**
   * Entradas y salidas de plata por método y banco.
   *
   * Se arma en cuatro consultas y se mezcla en memoria en vez de con un UNION:
   * las cuatro tablas tienen columnas distintas (y una tiene la fecha sin zona),
   * así que un UNION quedaría lleno de casts frágiles. El período acota el
   * tamaño.
   */
  private async cashByBank(
    query: ReportQuery,
    tenantId: string,
  ): Promise<ReportResult> {
    const range = { from: query.from, to: query.to };
    const bankId = query.uuid('bankId');
    const method = query.text('method');
    const search = query.text('search');
    const warnings: string[] = [];

    const banks = await this.bankRepo.find({ where: { tenantId } });
    const bankName = new Map(banks.map((b) => [b.id, b.name]));
    const nameOf = (
      id: string | number | boolean | null | undefined,
    ): string =>
      typeof id === 'string' && id
        ? (bankName.get(id) ?? 'Banco eliminado')
        : '—';

    // 1) Pagos de venta (entra).
    const salePaysQb = this.paymentRepo
      .createQueryBuilder('pay')
      .innerJoin('pay.sale', 's')
      .where('pay.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('pay.created_at'), range);
    if (bankId) salePaysQb.andWhere('pay.bank_id = :bankId', { bankId });
    if (method) salePaysQb.andWhere('pay.method = :method', { method });
    if (search) {
      salePaysQb.andWhere(
        '(s.sale_number ILIKE :q OR s.invoice_number ILIKE :q OR pay.reference ILIKE :q)',
        { q: `%${search}%` },
      );
    }
    const salePays = await salePaysQb
      .select(localDaySql('pay.created_at'), 'fecha')
      .addSelect('pay.method', 'metodo')
      .addSelect('pay.bank_id', 'bankId')
      .addSelect('pay.amount', 'monto')
      .addSelect('s.sale_number', 'ref')
      .addSelect("COALESCE(pay.reference, '')", 'nota')
      .orderBy('pay.created_at', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    // 2) Abonos de clientes (entra).
    const arPaysQb = this.arPayRepo
      .createQueryBuilder('arp')
      .innerJoin('arp.accountReceivable', 'ar')
      .leftJoin('ar.client', 'cl')
      .where('arp.tenant_id = :tenantId', { tenantId })
      .andWhere(timestampRangeSql('arp.created_at'), range);
    if (bankId) arPaysQb.andWhere('arp.bank_id = :bankId', { bankId });
    if (method) arPaysQb.andWhere('arp.method = :method', { method });
    if (search) {
      arPaysQb.andWhere(
        "((COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, '')) ILIKE :q" +
          ' OR arp.reference ILIKE :q)',
        { q: `%${search}%` },
      );
    }
    const arPays = await arPaysQb
      .select(localDaySql('arp.created_at'), 'fecha')
      .addSelect('arp.method', 'metodo')
      .addSelect('arp.bank_id', 'bankId')
      .addSelect('arp.amount', 'monto')
      .addSelect(
        "TRIM(COALESCE(cl.first_name, '') || ' ' || COALESCE(cl.last_name, ''))",
        'ref',
      )
      .addSelect("COALESCE(arp.reference, '')", 'nota')
      .orderBy('arp.created_at', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    // 3) Egresos (sale).
    const expensesQb = this.expenseRepo
      .createQueryBuilder('e')
      .leftJoin('e.category', 'ec')
      .where('e.tenant_id = :tenantId', { tenantId })
      .andWhere(dateRangeSql('e.expense_date'), range);
    if (bankId) expensesQb.andWhere('e.bank_id = :bankId', { bankId });
    if (method) expensesQb.andWhere('e.payment_method = :method', { method });
    if (search) {
      expensesQb.andWhere(
        '(e.description ILIKE :q OR e.expense_number ILIKE :q OR ec.name ILIKE :q)',
        { q: `%${search}%` },
      );
    }
    const expenses = await expensesQb
      .select('e.expense_date', 'fecha')
      .addSelect("COALESCE(e.payment_method, 'EFECTIVO')", 'metodo')
      .addSelect('e.bank_id', 'bankId')
      .addSelect('e.amount', 'monto')
      .addSelect('e.expense_number', 'ref')
      .addSelect("COALESCE(ec.name, '') || ' ' || e.description", 'nota')
      .orderBy('e.expense_date', 'DESC')
      .limit(MAX_ROWS)
      .getRawMany<RawRow>();

    // 4) Abonos a proveedores (sale). Esta tabla no guarda banco.
    const apPaysQb = this.apPayRepo
      .createQueryBuilder('app')
      .innerJoin('app.accountsPayable', 'ap')
      .innerJoin('ap.purchaseOrder', 'po')
      .leftJoin('po.supplier', 'sp')
      .where('app.tenant_id = :tenantId', { tenantId })
      .andWhere(naiveTimestampRangeSql('app.created_at'), range);
    if (method) apPaysQb.andWhere('app.method = :method', { method });
    if (search) {
      apPaysQb.andWhere('(sp.name ILIKE :q OR po.order_number ILIKE :q)', {
        q: `%${search}%`,
      });
    }
    // Si se filtra por banco, estos abonos no pueden cumplirlo: la tabla no
    // tiene la columna. Se excluyen y se avisa, en vez de mostrarlos como si
    // fueran de ese banco.
    const apPays = bankId
      ? []
      : await apPaysQb
          .select(naiveDaySql('app.created_at'), 'fecha')
          .addSelect('app.method', 'metodo')
          .addSelect('app.amount', 'monto')
          .addSelect('po.order_number', 'ref')
          .addSelect("COALESCE(sp.name, '')", 'nota')
          .orderBy('app.created_at', 'DESC')
          .limit(MAX_ROWS)
          .getRawMany<RawRow>();

    if (bankId) {
      warnings.push(
        'Los abonos a proveedores no aparecen al filtrar por banco: esos ' +
          'registros solo guardan la forma de pago, no el banco.',
      );
    }

    const rows: CashRow[] = [
      ...salePays.map((r) => ({
        fecha: String(r.fecha ?? ''),
        tipo: 'Venta',
        concepto: `Pago de venta ${r.ref ?? ''}`.trim(),
        metodo: String(r.metodo ?? ''),
        banco: nameOf(r.bankId),
        referencia: String(r.nota ?? ''),
        entrada: money(r.monto),
        salida: 0,
      })),
      ...arPays.map((r) => ({
        fecha: String(r.fecha ?? ''),
        tipo: 'Abono cliente',
        concepto: String(r.ref ?? '').trim() || 'Abono a cuenta por cobrar',
        metodo: String(r.metodo ?? ''),
        banco: nameOf(r.bankId),
        referencia: String(r.nota ?? ''),
        entrada: money(r.monto),
        salida: 0,
      })),
      ...expenses.map((r) => ({
        fecha: r.fecha ? String(r.fecha).slice(0, 10) : '',
        tipo: 'Egreso',
        concepto: String(r.nota ?? '').trim() || 'Egreso',
        metodo: String(r.metodo ?? ''),
        banco: nameOf(r.bankId),
        referencia: String(r.ref ?? ''),
        entrada: 0,
        salida: money(r.monto),
      })),
      ...apPays.map((r) => ({
        fecha: String(r.fecha ?? ''),
        tipo: 'Abono proveedor',
        concepto: `Abono a ${String(r.nota ?? '').trim() || 'proveedor'}`,
        metodo: String(r.metodo ?? ''),
        banco: '—',
        referencia: String(r.ref ?? ''),
        entrada: 0,
        salida: money(r.monto),
      })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));

    const capped = [salePays, arPays, expenses, apPays].some(
      (list) => list.length >= MAX_ROWS,
    );
    if (capped) {
      warnings.push(
        `Alguna de las fuentes llegó al tope de ${MAX_ROWS.toLocaleString('es-CO')} ` +
          `registros; los totales solo cubren lo que se muestra. Acota el período.`,
      );
    }

    const entradas = money(rows.reduce((s, r) => s + r.entrada, 0));
    const salidas = money(rows.reduce((s, r) => s + r.salida, 0));

    return {
      columns: [
        { key: 'fecha', label: 'Fecha', type: 'date' },
        { key: 'tipo', label: 'Tipo', type: 'text' },
        { key: 'concepto', label: 'Concepto', type: 'text' },
        { key: 'metodo', label: 'Forma de pago', type: 'text' },
        { key: 'banco', label: 'Banco', type: 'text' },
        { key: 'referencia', label: 'Referencia', type: 'text' },
        { key: 'entrada', label: 'Entra', type: 'money' },
        { key: 'salida', label: 'Sale', type: 'money' },
      ],
      rows: rows.slice(0, MAX_ROWS),
      totals: [
        { key: 'entradas', label: 'Entradas', type: 'money', value: entradas },
        { key: 'salidas', label: 'Salidas', type: 'money', value: salidas },
        {
          key: 'neto',
          label: 'Neto',
          type: 'money',
          value: money(entradas - salidas),
        },
        {
          key: 'movimientos',
          label: 'Movimientos',
          type: 'number',
          value: rows.length,
        },
      ],
      title: `Movimiento por banco ${query.from} a ${query.to}`,
      warnings,
    };
  }
}
