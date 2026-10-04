/**
 * Dos recibos corregidos por Andrea el 2026-10-03 (chat): el RC 386 ($948.300)
 * paga la factura 564 y no la 580; el RC 404 de la 665 vale $252.195.
 *     node dist/seeds/corregir-recibos-2026-10-04.js apply
 */
// Dos correcciones que Andrea confirmó el 3 oct: el RC 386 ($948.300) paga la
// factura 564 (estaba en la 580); el RC 404 de la 665 vale $252.195 (estaba en $252.030).
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
const APLICAR = process.argv[2] === 'apply';

async function main() {
  await AppDataSource.initialize();
  const ds = AppDataSource;
  const [{ id: t }] = await ds.query(
    `SELECT id FROM tenants WHERE slug='distriamber'`,
  );
  const cuenta = async (inv) =>
    (
      await ds.query(
        `SELECT ar.id, ar.total_amount::float AS total, ar.paid_amount::float AS pagado, ar.is_fully_paid AS saldada FROM accounts_receivable ar JOIN sales s ON s.id=ar.sale_id WHERE s.tenant_id=$1 AND s.invoice_number=$2`,
        [t, inv],
      )
    )[0];
  const pago = async (arId, monto) =>
    (
      await ds.query(
        `SELECT id, amount::float AS monto, reference FROM accounts_receivable_payments WHERE tenant_id=$1 AND account_receivable_id=$2 AND abs(amount-$3)<0.01`,
        [t, arId, monto],
      )
    )[0];
  const a580 = await cuenta('FE-000580'),
    a564 = await cuenta('FE-000564'),
    a665 = await cuenta('FE-000665');
  const p386 = await pago(a580.id, 948300),
    p404 = await pago(a665.id, 252030);
  console.log('580', a580, 'pago386', p386);
  console.log('564', a564);
  console.log('665', a665, 'pago404', p404);
  if (!p386 || !p404) throw new Error('no están los pagos esperados');
  if (a564.total - a564.paid < 948300 - 0.01)
    throw new Error(`564 solo debe ${a564.total - a564.pagado}`);
  const recalc = async (m, arId) => {
    const [{ s }] = await m.query(
      `SELECT coalesce(sum(amount),0)::float AS s FROM accounts_receivable_payments WHERE account_receivable_id=$1`,
      [arId],
    );
    const [{ total }] = await m.query(
      `SELECT total_amount::float AS total FROM accounts_receivable WHERE id=$1`,
      [arId],
    );
    const saldada = Math.abs(s - total) < 0.005 || s > total;
    await m.query(
      `UPDATE accounts_receivable SET paid_amount=$2, is_fully_paid=$3, fully_paid_at=CASE WHEN $3 THEN coalesce(fully_paid_at, now()) ELSE NULL END WHERE id=$1`,
      [arId, s, saldada],
    );
    return { s, total, saldada };
  };
  if (!APLICAR) {
    console.log('Ensayo: nada escrito.');
    await ds.destroy();
    return;
  }
  await ds.transaction(async (m) => {
    await m.query(
      `UPDATE accounts_receivable_payments SET account_receivable_id=$2, reference='386', notes=coalesce(notes,'')||' [corrección 2026-10-04: RC 386 paga la 564, no la 580 (Andrea)]' WHERE id=$1`,
      [p386.id, a564.id],
    );
    await m.query(
      `UPDATE accounts_receivable_payments SET amount=252195, reference='404', notes=coalesce(notes,'')||' [corrección 2026-10-04: RC 404 vale 252.195 (Andrea)]' WHERE id=$1`,
      [p404.id],
    );
    console.log('580 →', await recalc(m, a580.id));
    console.log('564 →', await recalc(m, a564.id));
    console.log('665 →', await recalc(m, a665.id));
  });
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
