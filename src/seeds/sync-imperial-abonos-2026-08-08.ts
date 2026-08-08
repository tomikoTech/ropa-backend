/**
 * Sincroniza los tres abonos corregidos por Imperial / Distri Amber en el
 * archivo FINAL_Facturas y Cartera MIPINTA.. (1).xlsx del 2026-08-08.
 *
 * Es deliberadamente incremental: no borra ni vuelve a crear facturas. Cada
 * abono se inserta una sola vez y se valida contra el acumulado de la cuenta
 * por cobrar antes de escribir.
 *
 * Uso:
 *   DRY_RUN=1 node dist/seeds/sync-imperial-abonos-2026-08-08.js
 *   node dist/seeds/sync-imperial-abonos-2026-08-08.js
 */
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { AccountsReceivable } from '../pos/entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from '../pos/entities/accounts-receivable-payment.entity.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';

const TENANT_SLUG = 'distriamber';
const IMPORT_MARKER = '[sync:imperial-abonos-2026-08-08]';
const DRY_RUN = process.env.DRY_RUN === '1';

interface SourcePayment {
  invoiceNumber: string;
  invoice: string;
  amount: number;
  expectedPaidAmount: number;
  date: string;
  receipt: string;
  sourceRow: number;
}

// El # RC de Excel está almacenado como decimal, pero la celda tiene formato
// entero ("0"); estos son los valores que ve la usuaria: 412 y 416.
const SOURCE_PAYMENTS: SourcePayment[] = [
  {
    invoiceNumber: 'FE-000613',
    invoice: '613',
    amount: 96_000,
    expectedPaidAmount: 96_000,
    date: '2026-07-18',
    receipt: '412',
    sourceRow: 603,
  },
  {
    invoiceNumber: 'FE-000390',
    invoice: '390',
    amount: 996_625,
    expectedPaidAmount: 996_625,
    date: '2026-07-25',
    receipt: '416',
    sourceRow: 609,
  },
  {
    invoiceNumber: 'FE-000405',
    invoice: '405',
    amount: 3_375,
    expectedPaidAmount: 3_375,
    date: '2026-07-25',
    receipt: '416',
    sourceRow: 610,
  },
];

const moneyEquals = (left: number, right: number): boolean =>
  Math.abs(left - right) < 0.005;

const localNoon = (iso: string): Date => new Date(`${iso}T12:00:00-05:00`);

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const paymentNote = (source: SourcePayment): string =>
  `[import:facturas-xlsx] abono factura ${source.invoice} ${IMPORT_MARKER} fila ${source.sourceRow}`;

async function syncPayment(
  manager: EntityManager,
  tenantId: string,
  source: SourcePayment,
): Promise<'created' | 'unchanged'> {
  const sale = await manager.getRepository(Sale).findOne({
    where: { tenantId, invoiceNumber: source.invoiceNumber },
  });
  if (!sale) throw new Error(`No existe ${source.invoiceNumber}`);

  const account = await manager.getRepository(AccountsReceivable).findOne({
    where: { tenantId, saleId: sale.id },
    lock: { mode: 'pessimistic_write' },
  });
  if (!account) {
    throw new Error(`${source.invoiceNumber} no tiene cuenta por cobrar`);
  }

  const paymentRepository = manager.getRepository(AccountsReceivablePayment);
  const payments = await paymentRepository.find({
    where: { tenantId, accountReceivableId: account.id },
  });
  const recordedTotal = payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const currentPaidAmount = Number(account.paidAmount);
  if (!moneyEquals(recordedTotal, currentPaidAmount)) {
    throw new Error(
      `${source.invoiceNumber} está descuadrada antes de importar: ` +
        `abonos=${recordedTotal}, acumulado=${currentPaidAmount}`,
    );
  }

  const note = paymentNote(source);
  const existing = payments.filter((payment) => payment.notes === note);
  if (existing.length > 1) {
    throw new Error(
      `${source.invoiceNumber} tiene el abono sincronizado repetido`,
    );
  }
  if (existing.length === 1) {
    const payment = existing[0];
    const matches =
      moneyEquals(Number(payment.amount), source.amount) &&
      payment.method === PaymentMethod.EFECTIVO &&
      payment.reference === source.receipt &&
      dateOnly(payment.createdAt) === source.date &&
      moneyEquals(currentPaidAmount, source.expectedPaidAmount);
    if (!matches) {
      throw new Error(
        `${source.invoiceNumber} ya tiene el marcador, pero sus datos no coinciden`,
      );
    }
    console.log(`${source.invoiceNumber}: ya estaba sincronizada; sin cambios`);
    return 'unchanged';
  }

  const expectedPreviousPaid = source.expectedPaidAmount - source.amount;
  if (!moneyEquals(currentPaidAmount, expectedPreviousPaid)) {
    throw new Error(
      `${source.invoiceNumber}: se esperaba acumulado previo ${expectedPreviousPaid}, ` +
        `pero producción tiene ${currentPaidAmount}`,
    );
  }
  if (source.expectedPaidAmount > Number(account.totalAmount) + 0.005) {
    throw new Error(
      `${source.invoiceNumber}: el abono excedería el total de la cuenta`,
    );
  }

  const isFullyPaid = moneyEquals(
    source.expectedPaidAmount,
    Number(account.totalAmount),
  );
  if (DRY_RUN) {
    console.log(
      `${source.invoiceNumber}: se insertaría abono ${source.amount} ` +
        `(RC ${source.receipt}, ${source.date}); acumulado ${source.expectedPaidAmount}`,
    );
    return 'created';
  }

  const paymentDate = localNoon(source.date);
  await paymentRepository.save(
    paymentRepository.create({
      accountReceivableId: account.id,
      amount: source.amount,
      method: PaymentMethod.EFECTIVO,
      reference: source.receipt,
      bankId: null,
      notes: note,
      createdAt: paymentDate,
      tenantId,
    }),
  );
  await manager.getRepository(AccountsReceivable).update(
    { id: account.id, tenantId },
    {
      paidAmount: source.expectedPaidAmount,
      isFullyPaid,
      ...(isFullyPaid ? { fullyPaidAt: paymentDate } : {}),
    },
  );
  console.log(`${source.invoiceNumber}: abono ${source.amount} sincronizado`);
  return 'created';
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const tenant = await manager
        .getRepository(Tenant)
        .findOne({ where: { slug: TENANT_SLUG } });
      if (!tenant) throw new Error(`Tenant no encontrado: ${TENANT_SLUG}`);

      let changed = 0;
      for (const source of SOURCE_PAYMENTS) {
        if ((await syncPayment(manager, tenant.id, source)) === 'created') {
          changed += 1;
        }
      }
      console.log(
        `${DRY_RUN ? 'DRY_RUN OK' : 'Sincronización OK'}: ${changed} ` +
          `abonos ${DRY_RUN ? 'por insertar' : 'insertados'}, ` +
          `${SOURCE_PAYMENTS.length - changed} sin cambios`,
      );
    });
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    'SINCRONIZACIÓN FALLÓ:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
