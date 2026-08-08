/**
 * Backfill idempotente de la factura histórica 699-2 de Imperial/Distri Amber.
 *
 * Solo inserta la venta y su cuenta por cobrar. No toca la factura 699 ni
 * ninguna otra fila. Si 699-2 ya existe, valida que sea idéntica y termina sin
 * escribir. Si existe parcialmente o con datos distintos, falla de forma
 * explícita para que nadie sobrescriba información de producción.
 *
 * Uso:
 *   DRY_RUN=1 node dist/seeds/add-imperial-invoice-699-2.js
 *   node dist/seeds/add-imperial-invoice-699-2.js
 */
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { AccountsReceivable } from '../pos/entities/accounts-receivable.entity.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { SaleChannel } from '../common/enums/sale-channel.enum.js';
import { IMPERIAL_INVOICE_699_2 } from './imperial-invoice-row.js';

const TENANT_SLUG = 'distriamber';
const INVOICE_NUMBER = 'FE-000699-2';
const SALE_NUMBER = 'IMP-000699-2';
const BASE_INVOICE_NUMBER = 'FE-000699';
const IMPORT_NOTE = '[import:facturas-xlsx] Factura 699-2';
const DRY_RUN = process.env.DRY_RUN === '1';

const localNoon = (iso: string, sequenceSeconds = 0): Date => {
  const date = new Date(`${iso}T12:00:00-05:00`);
  date.setSeconds(date.getSeconds() + sequenceSeconds);
  return date;
};

const dateOnly = (value: Date | string): string =>
  new Date(value).toISOString().slice(0, 10);

const assertExistingMatches = async (
  manager: EntityManager,
  sale: Sale,
  client: Client,
): Promise<void> => {
  const row = IMPERIAL_INVOICE_699_2;
  const account = await manager.getRepository(AccountsReceivable).findOne({
    where: { saleId: sale.id, tenantId: sale.tenantId },
  });
  const mismatches: string[] = [];
  if (sale.saleNumber !== SALE_NUMBER) mismatches.push('saleNumber');
  if (sale.clientId !== client.id) mismatches.push('clientId');
  if (Number(sale.subtotal) !== row.valor) mismatches.push('subtotal');
  if (Number(sale.discountAmount) !== row.descuento)
    mismatches.push('discountAmount');
  if (Number(sale.total) !== row.total) mismatches.push('total');
  if (dateOnly(sale.createdAt) !== row.fecha) mismatches.push('createdAt');
  if (!account) {
    mismatches.push('accountsReceivable');
  } else {
    if (account.clientId !== client.id) mismatches.push('ar.clientId');
    if (Number(account.totalAmount) !== row.total)
      mismatches.push('ar.totalAmount');
    if (Number(account.paidAmount) !== row.abonos)
      mismatches.push('ar.paidAmount');
    if (account.isFullyPaid) mismatches.push('ar.isFullyPaid');
    if (dateOnly(account.dueDate) !== row.vence) mismatches.push('ar.dueDate');
  }
  if (mismatches.length > 0) {
    throw new Error(
      `${INVOICE_NUMBER} ya existe pero no coincide en: ${mismatches.join(', ')}`,
    );
  }
};

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const tenant = await manager
        .getRepository(Tenant)
        .findOne({ where: { slug: TENANT_SLUG } });
      if (!tenant) throw new Error(`Tenant no encontrado: ${TENANT_SLUG}`);

      // Reutiliza exactamente el cliente histórico de la importación original,
      // no alguno de los homónimos creados posteriormente desde la interfaz.
      const clients = await manager
        .getRepository(Client)
        .createQueryBuilder('client')
        .where('client.tenant_id = :tenantId', { tenantId: tenant.id })
        .andWhere('UPPER(TRIM(client.first_name)) = :name', {
          name: IMPERIAL_INVOICE_699_2.nombre.toUpperCase(),
        })
        .andWhere("TRIM(COALESCE(client.last_name, '')) = ''")
        .getMany();
      if (clients.length !== 1) {
        throw new Error(
          `Se esperaba un único cliente histórico ${IMPERIAL_INVOICE_699_2.nombre}; encontrados: ${clients.length}`,
        );
      }
      const client = clients[0];

      const saleRepo = manager.getRepository(Sale);
      const byInvoice = await saleRepo.findOne({
        where: { tenantId: tenant.id, invoiceNumber: INVOICE_NUMBER },
      });
      const bySaleNumber = await saleRepo.findOne({
        where: { tenantId: tenant.id, saleNumber: SALE_NUMBER },
      });
      if (byInvoice || bySaleNumber) {
        if (!byInvoice || !bySaleNumber || byInvoice.id !== bySaleNumber.id) {
          throw new Error(
            `${INVOICE_NUMBER} existe parcialmente o colisiona con ${SALE_NUMBER}`,
          );
        }
        await assertExistingMatches(manager, byInvoice, client);
        console.log(
          `${INVOICE_NUMBER} ya existe y coincide; no se escribió nada.`,
        );
        return;
      }

      const baseSale = await saleRepo.findOne({
        where: {
          tenantId: tenant.id,
          invoiceNumber: BASE_INVOICE_NUMBER,
        },
      });
      if (!baseSale) {
        throw new Error(
          `No existe ${BASE_INVOICE_NUMBER}; no se puede heredar vendedor y bodega`,
        );
      }

      const row = IMPERIAL_INVOICE_699_2;
      if (DRY_RUN) {
        console.log(
          `DRY_RUN OK: se crearía ${INVOICE_NUMBER} para ${row.nombre} por ${row.total}, saldo ${row.saldo}.`,
        );
        return;
      }

      const sale = await saleRepo.save(
        saleRepo.create({
          saleNumber: SALE_NUMBER,
          invoiceNumber: INVOICE_NUMBER,
          clientId: client.id,
          userId: baseSale.userId,
          warehouseId: baseSale.warehouseId,
          subtotal: row.valor,
          discountAmount: row.descuento,
          taxAmount: 0,
          total: row.total,
          status: SaleStatus.COMPLETED,
          saleChannel: SaleChannel.POS,
          isPaid: true,
          notes: IMPORT_NOTE,
          createdAt: localNoon(row.fecha, 699),
          tenantId: tenant.id,
        }),
      );
      await manager.getRepository(AccountsReceivable).save({
        saleId: sale.id,
        clientId: client.id,
        totalAmount: row.total,
        paidAmount: row.abonos,
        dueDate: localNoon(row.vence),
        isFullyPaid: false,
        fullyPaidAt: null as unknown as Date,
        notes: IMPORT_NOTE,
        createdAt: sale.createdAt,
        tenantId: tenant.id,
      });
      console.log(
        `${INVOICE_NUMBER} creada para ${row.nombre}: total ${row.total}, saldo ${row.saldo}.`,
      );
    });
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    'BACKFILL FALLÓ:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
