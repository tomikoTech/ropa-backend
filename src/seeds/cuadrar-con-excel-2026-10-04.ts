/**
 * «Lo real y lo fijo es lo del Excel» (Dylan, 2026-10-04): lo que el sistema
 * tenía de julio y no está en los archivos de Andrea se cuadra con ellos.
 *
 *  - Cuatro cuentas por pagar de julio que no aparecen en «PROVEEDORES 3 DE
 *    OCTUBRE» se cierran en cero (la orden y su inventario se quedan; los
 *    pagos que tenían se borran porque tampoco están en el Excel).
 *  - VS factura 10583: el Excel dice valor y abono 2.200.000 (el sistema
 *    tenía 3.200.000).
 *  - Factura de venta 665: el Excel de recibos dice que vale 252.195 y el
 *    recibo 404 la paga completa (el sistema la tenía en 267.030).
 *
 *     node dist/seeds/cuadrar-con-excel-2026-10-04.js apply
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';

const NOTA = '[cuadre con Excel 2026-10-04]';
const APLICAR = process.argv[2] === 'apply';

async function main() {
  await AppDataSource.initialize();
  const ds = AppDataSource;
  try {
    const [{ id: t }] = await ds.query(
      `SELECT id FROM tenants WHERE slug = 'distriamber'`,
    );
    // 1) Las cuatro de julio sin pareja: por proveedor + total + sin marcador de import.
    const sinPareja: {
      ap_id: string;
      proveedor: string;
      total: string;
      paid: string;
      factura: string;
    }[] = await ds.query(
      `SELECT ap.id AS ap_id, s.name AS proveedor, ap.amount AS total, ap.paid_amount AS paid, coalesce(po.supplier_invoice_number,'') AS factura
         FROM accounts_payable ap JOIN purchase_orders po ON po.id = ap.purchase_order_id JOIN suppliers s ON s.id = po.supplier_id
        WHERE ap.tenant_id = $1 AND coalesce(ap.notes,'') NOT LIKE '%[import:proveedores-xlsx-2026-10-03]%'
          AND ((s.name = 'PERFUMERIA BENEIDA' AND ap.amount = 1840000) OR (s.name = 'BRADA' AND ap.amount = 2301000)
            OR (s.name = 'JHESSENCE GLAS' AND ap.amount = 2760000) OR (s.name = 'MUNDO PERFUMES' AND ap.amount = 4556000))`,
      [t],
    );
    console.log(
      `Cuentas de julio que no están en el Excel: ${sinPareja.length}`,
    );
    for (const c of sinPareja)
      console.log(
        `  ${c.proveedor} fact ${c.factura || '—'} ${Number(c.total).toLocaleString('es-CO')} (abonado ${Number(c.paid).toLocaleString('es-CO')}) → se cierra en 0`,
      );
    if (sinPareja.length !== 4) throw new Error('Se esperaban exactamente 4');
    // 2) VS 10583
    const [vs]: { ap_id: string; amount: string; paid: string }[] =
      await ds.query(
        `SELECT ap.id AS ap_id, ap.amount, ap.paid_amount AS paid FROM accounts_payable ap JOIN purchase_orders po ON po.id = ap.purchase_order_id
        WHERE ap.tenant_id = $1 AND po.supplier_invoice_number = '10583'`,
        [t],
      );
    console.log(
      `VS 10583: ${Number(vs.amount).toLocaleString('es-CO')} abonado ${Number(vs.paid).toLocaleString('es-CO')} → 2.200.000 / 2.200.000`,
    );
    // 3) Factura de venta 665
    const [ar]: {
      ar_id: string;
      sale_id: string;
      total: string;
      paid: string;
    }[] = await ds.query(
      `SELECT ar.id AS ar_id, s.id AS sale_id, ar.total_amount AS total, ar.paid_amount AS paid FROM accounts_receivable ar JOIN sales s ON s.id = ar.sale_id
        WHERE s.tenant_id = $1 AND s.invoice_number = 'FE-000665'`,
      [t],
    );
    console.log(
      `FE-000665: ${Number(ar.total).toLocaleString('es-CO')} abonado ${Number(ar.paid).toLocaleString('es-CO')} → 252.195 pagada`,
    );
    if (!APLICAR) {
      console.log('Ensayo: nada escrito.');
      return;
    }
    await ds.transaction(async (m) => {
      for (const c of sinPareja) {
        await m.query(
          `DELETE FROM accounts_payable_payments WHERE accounts_payable_id = $1`,
          [c.ap_id],
        );
        await m.query(
          `UPDATE accounts_payable SET amount = 0, paid_amount = 0, is_paid = true, paid_at = now(), notes = coalesce(notes,'') || ' ' || $2 || ' no está en el Excel de Andrea: se cierra' WHERE id = $1`,
          [c.ap_id, NOTA],
        );
      }
      await m.query(
        `UPDATE accounts_payable_payments SET amount = 2200000, notes = coalesce(notes,'') || ' ' || $2 WHERE accounts_payable_id = $1 AND amount = 3200000`,
        [vs.ap_id, NOTA],
      );
      await m.query(
        `UPDATE accounts_payable SET amount = 2200000, paid_amount = (SELECT coalesce(sum(amount),0) FROM accounts_payable_payments WHERE accounts_payable_id = $1), is_paid = true, notes = coalesce(notes,'') || ' ' || $2 WHERE id = $1`,
        [vs.ap_id, NOTA],
      );
      await m.query(
        `UPDATE sales SET total = 252195, subtotal = 252195 WHERE id = $1`,
        [ar.sale_id],
      );
      await m.query(
        `UPDATE accounts_receivable SET total_amount = 252195, is_fully_paid = (paid_amount >= 252195), fully_paid_at = CASE WHEN paid_amount >= 252195 THEN coalesce(fully_paid_at, now()) ELSE NULL END, notes = coalesce(notes,'') || ' ' || $2 WHERE id = $1`,
        [ar.ar_id, NOTA],
      );
    });
    console.log('Hecho.');
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
