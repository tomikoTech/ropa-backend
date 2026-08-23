/**
 * Importador de facturación + cartera histórica: Imperial / Distri Amber.
 *
 * Lee un JSON (generado por clientes/imperial/build-import-payload.py) y crea
 * en MiPinta, para el tenant `distriamber`:
 *   - Clientes (unificados por nombre normalizado)
 *   - Una venta a crédito por factura (sin ítems de línea), con invoiceNumber
 *     FE-000001..FE-000711 (los duplicados 525/692 quedan como FE-000NNN-2)
 *   - Una cuenta por cobrar (AccountsReceivable) por factura, con su saldo
 *   - El historial detallado de abonos (AccountsReceivablePayment)
 *
 * Recarga limpia: primero borra la importación previa (ventas cuyo notes
 * contiene el marcador [import:facturas-xlsx]) y sus AR/abonos, para no duplicar.
 *
 * Uso:
 *   DRY_RUN=1 PAYLOAD_PATH=/ruta/imperial-payload.json node dist/seeds/import-imperial-facturas.js
 *   PAYLOAD_PATH=... node dist/seeds/import-imperial-facturas.js       # ejecuta (usa .env)
 */
import { DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Payment } from '../pos/entities/payment.entity.js';
import { AccountsReceivable } from '../pos/entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from '../pos/entities/accounts-receivable-payment.entity.js';
import { Supplier } from '../suppliers/entities/supplier.entity.js';
import { PurchaseOrder } from '../purchases/entities/purchase-order.entity.js';
import { PurchaseOrderItem } from '../purchases/entities/purchase-order-item.entity.js';
import { AccountsPayable } from '../purchases/entities/accounts-payable.entity.js';
import { AccountsPayablePayment } from '../purchases/entities/accounts-payable-payment.entity.js';
import { Promotion } from '../promotions/entities/promotion.entity.js';
import { Return } from '../returns/entities/return.entity.js';
import { ReturnItem } from '../returns/entities/return-item.entity.js';
import { CreditNote } from '../returns/entities/credit-note.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from '../storefront/entities/ecommerce-order-item.entity.js';
import { EcommerceCustomer } from '../storefront/entities/ecommerce-customer.entity.js';
import { Role } from '../common/enums/role.enum.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { SaleChannel } from '../common/enums/sale-channel.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { diaDeCalendario } from '../common/utils/dia-de-calendario.util.js';

dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';
const MARKER = '[import:facturas-xlsx]';

interface Abono {
  fecha: string | null;
  rc: string | null;
  amount: number;
  adjust?: boolean;
}
interface Factura {
  fact: number;
  invoiceNumber: string;
  saleNumber: string;
  fecha: string | null;
  vence: string | null;
  clientKey: string | null;
  subtotal: number;
  discount: number;
  total: number;
  saldo: number;
  paidAmount: number;
  estado: string | null;
  annulled?: boolean;
  abonos: Abono[];
}

// Construye una fecha LOCAL a mediodía (evita el corrimiento de día por UTC) y
// le suma `seq` segundos para desempatar el orden dentro del mismo día (así la
// factura de número más alto queda con created_at más reciente → el generador
// de invoiceNumber continúa correctamente en 712).
function localDate(iso: string, seq = 0): Date {
  const d = new Date(`${iso}T12:00:00`);
  d.setSeconds(d.getSeconds() + seq);
  return d;
}
interface Payload {
  tenantSlug: string;
  importMarker: string;
  clients: { key: string; displayName: string }[];
  facturas: Factura[];
}

const norm = (s: string | null | undefined) =>
  s ? s.toUpperCase().split(/\s+/).filter(Boolean).join(' ') : '';

async function main() {
  const payloadPath = process.env.PAYLOAD_PATH;
  if (!payloadPath || !fs.existsSync(payloadPath)) {
    throw new Error(`PAYLOAD_PATH inválido o no existe: ${payloadPath}`);
  }
  const payload: Payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

  const host = process.env.DB_HOST || 'localhost';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const ds = new DataSource({
    type: 'postgres',
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'dylanbc1',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'ropa_pos',
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
    entities: [
      Tenant, User, RefreshToken, Category, Product, ProductVariant, Warehouse,
      Stock, StockMovement, Client, Sale, SaleItem, Payment, AccountsReceivable,
      AccountsReceivablePayment, Supplier, PurchaseOrder, PurchaseOrderItem,
      AccountsPayable, AccountsPayablePayment, Promotion, Return, ReturnItem,
      CreditNote, AuditLog, StoreSettings, EcommerceOrder, EcommerceOrderItem,
      EcommerceCustomer,
    ],
    synchronize: false,
  });
  await ds.initialize();
  console.log(
    `Conectado a ${host}/${process.env.DB_DATABASE} (local=${isLocal}, DRY_RUN=${DRY_RUN})`,
  );

  try {
    // 1) Tenant
    const tenant = await ds
      .getRepository(Tenant)
      .findOne({ where: { slug: payload.tenantSlug } });
    if (!tenant) throw new Error(`Tenant no encontrado: ${payload.tenantSlug}`);
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);

    // 2) Usuario (vendedor) y bodega para las ventas
    const user =
      (await ds.getRepository(User).findOne({
        where: { tenantId: tenant.id, role: Role.ADMIN },
        order: { createdAt: 'ASC' },
      })) ??
      (await ds
        .getRepository(User)
        .findOne({ where: { tenantId: tenant.id }, order: { createdAt: 'ASC' } }));
    if (!user) throw new Error('No hay usuario para asignar las ventas');
    const warehouse = await ds
      .getRepository(Warehouse)
      .findOne({ where: { tenantId: tenant.id }, order: { createdAt: 'ASC' } });
    if (!warehouse) throw new Error('No hay bodega para asignar las ventas');
    console.log(`Vendedor: ${user.email} | Bodega: ${warehouse.name}`);

    // 3) Borrar importación previa (marcador en notes)
    const prevSales = await ds
      .getRepository(Sale)
      .createQueryBuilder('s')
      .where('s.tenant_id = :t', { t: tenant.id })
      .andWhere('s.notes LIKE :m', { m: `%${MARKER}%` })
      .getMany();
    console.log(`Importación previa a borrar: ${prevSales.length} ventas`);
    if (!DRY_RUN && prevSales.length) {
      const ids = prevSales.map((s) => s.id);
      await ds.transaction(async (m) => {
        const ars = await m
          .getRepository(AccountsReceivable)
          .find({ where: { saleId: In(ids) } });
        const arIds = ars.map((a) => a.id);
        if (arIds.length)
          await m
            .getRepository(AccountsReceivablePayment)
            .delete({ accountReceivableId: In(arIds) });
        if (arIds.length)
          await m.getRepository(AccountsReceivable).delete({ id: In(arIds) });
        await m.getRepository(Payment).delete({ saleId: In(ids) });
        await m.getRepository(SaleItem).delete({ saleId: In(ids) });
        await m.getRepository(Sale).delete({ id: In(ids) });
      });
      console.log('  -> importación previa borrada');
    }

    // 4) Clientes (unificados por nombre normalizado)
    const clientMap = new Map<string, string>(); // key -> clientId
    for (const c of payload.clients) {
      const key = norm(c.key);
      const existing = await ds
        .getRepository(Client)
        .createQueryBuilder('c')
        .where('c.tenant_id = :t', { t: tenant.id })
        .andWhere('UPPER(TRIM(c.first_name)) = :n', { n: key })
        .getOne();
      if (existing) {
        clientMap.set(key, existing.id);
      } else if (!DRY_RUN) {
        const saved = await ds.getRepository(Client).save(
          ds.getRepository(Client).create({
            firstName: c.displayName,
            lastName: '',
            tenantId: tenant.id,
          }),
        );
        clientMap.set(key, saved.id);
      } else {
        clientMap.set(key, 'DRY');
      }
    }
    console.log(`Clientes: ${clientMap.size} (unificados)`);

    // 5) Facturas -> venta + CxC + abonos
    let created = 0;
    let arCount = 0;
    let payCount = 0;
    // Construir todas las filas en memoria con UUIDs pre-generados, para luego
    // insertarlas en BLOQUE (evita ~2000 round-trips uno-por-uno contra la DB
    // remota, que tardaban horas). AR y abonos referencian los IDs generados.
    const saleRows: Partial<Sale>[] = [];
    const arRows: Partial<AccountsReceivable>[] = [];
    const payRows: Partial<AccountsReceivablePayment>[] = [];
    for (const f of payload.facturas) {
      const clientId =
        f.annulled || !f.clientKey
          ? undefined
          : clientMap.get(norm(f.clientKey));
      const saleDate = f.fecha ? localDate(f.fecha, f.fact) : new Date();
      const saleId = randomUUID();
      saleRows.push({
        id: saleId,
        saleNumber: f.saleNumber,
        invoiceNumber: f.invoiceNumber,
        clientId: clientId || undefined,
        userId: user.id,
        warehouseId: warehouse.id,
        subtotal: f.subtotal,
        discountAmount: f.discount,
        taxAmount: 0,
        total: f.total,
        status: f.annulled ? SaleStatus.CANCELLED : SaleStatus.COMPLETED,
        saleChannel: SaleChannel.POS,
        notes: `${MARKER} Factura ${f.fact}${f.annulled ? ' (ANULADA)' : ''}`,
        createdAt: saleDate,
        tenantId: tenant.id,
      });
      created++;
      if (clientId && !f.annulled) {
        const arId = randomUUID();
        arRows.push({
          id: arId,
          saleId,
          clientId,
          totalAmount: f.total,
          paidAmount: f.paidAmount,
          // Un día, no un instante: ver `dia-de-calendario.util.ts`.
          dueDate: diaDeCalendario(f.vence || saleDate),
          isFullyPaid: f.saldo <= 0,
          fullyPaidAt: f.saldo <= 0 ? saleDate : undefined,
          notes: `${MARKER} Factura ${f.fact}`,
          createdAt: saleDate,
          tenantId: tenant.id,
        });
        arCount++;
        for (const ab of f.abonos) {
          payRows.push({
            accountReceivableId: arId,
            amount: ab.amount,
            method: PaymentMethod.EFECTIVO,
            reference: ab.rc || undefined,
            notes: ab.adjust
              ? `${MARKER} ajuste de cuadre`
              : `${MARKER} abono factura ${f.fact}`,
            createdAt: ab.fecha ? localDate(ab.fecha) : saleDate,
            tenantId: tenant.id,
          });
          payCount++;
        }
      }
    }

    if (!DRY_RUN) {
      const chunk = <T>(arr: T[], n: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };
      await ds.transaction(async (m) => {
        for (const c of chunk(saleRows, 200))
          await m.getRepository(Sale).insert(c);
        for (const c of chunk(arRows, 200))
          await m.getRepository(AccountsReceivable).insert(c);
        for (const c of chunk(payRows, 300))
          await m.getRepository(AccountsReceivablePayment).insert(c);
      });
    }

    console.log('\n===== RESUMEN =====');
    console.log(`Ventas (facturas) creadas: ${created}`);
    console.log(`Cuentas por cobrar creadas: ${arCount}`);
    console.log(`Abonos creados: ${payCount}`);
    console.log(
      `Cartera pendiente: ${payload.facturas
        .reduce((s, f) => s + f.saldo, 0)
        .toLocaleString('es-CO')}`,
    );
    console.log(DRY_RUN ? '(DRY_RUN: no se escribió nada)' : 'Importación OK');
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error('IMPORT FALLÓ:', e.message);
  process.exit(1);
});
