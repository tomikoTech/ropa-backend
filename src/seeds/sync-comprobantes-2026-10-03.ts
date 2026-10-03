/**
 * Carga los abonos del archivo «MI PINTA COMPROBANTES DE PAGO.xlsx» que Andrea
 * mandó el 2026-10-03 y que aún no están en el sistema.
 *
 * El archivo es su libro de recibos: # RC, fecha, factura, cliente y abono.
 * Se cruzó contra producción fuera de este script (645 abonos: 592 ya
 * estaban, 53 faltan). Acá entra solo la lista de los que faltan, en JSON,
 * y cada uno se valida contra la cuenta por cobrar antes de escribir:
 *
 *  - si la factura no tiene cuenta por cobrar (venta cobrada de contado en el
 *    POS), no se inserta y se avisa;
 *  - si el abono del Excel es mayor que lo que la factura debe, se abona lo
 *    que debe y se avisa (en ese archivo a veces el abono viene bruto, antes
 *    del descuento por pronto pago);
 *  - el número de recibo va en `reference`, la fecha del recibo en
 *    `created_at`, y el marcador en `notes` lo hace repetible sin duplicar.
 *
 *     PLAN=plan-abonos.json node dist/seeds/sync-comprobantes-2026-10-03.js         (ensayo)
 *     MODE=apply PLAN=plan-abonos.json node dist/seeds/sync-comprobantes-2026-10-03.js
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { AppDataSource } from '../config/data-source.js';

const MARCADOR = '[sync:comprobantes-2026-10-03]';
const SLUG = process.env.TENANT?.trim() || 'distriamber';

interface AbonoDelExcel {
  fila: number;
  rc: string | null;
  fecha: string | null;
  inv: string;
  monto: number;
}

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const plan = JSON.parse(readFileSync(process.env.PLAN!, 'utf8')) as {
    ins: AbonoDelExcel[];
  };
  await AppDataSource.initialize();
  const ds = AppDataSource;
  try {
    const [tenant]: { id: string }[] = await ds.query(
      `SELECT id FROM tenants WHERE slug = $1`,
      [SLUG],
    );
    const t = tenant.id;
    console.log(
      `${aplicar ? 'APLICANDO' : 'ENSAYO'} en ${SLUG}: ${plan.ins.length} abonos del Excel que faltan`,
    );
    const avisos: string[] = [];
    let insertados = 0;
    let total = 0;
    for (const a of plan.ins.sort((x, y) => x.inv.localeCompare(y.inv))) {
      const nota = `${MARCADOR} abono factura ${a.inv} fila ${a.fila}${a.rc ? ` RC ${a.rc}` : ''}`;
      const [ya]: { n: string }[] = await ds.query(
        `SELECT count(*) AS n FROM accounts_receivable_payments WHERE tenant_id = $1 AND notes = $2`,
        [t, nota],
      );
      if (Number(ya.n) > 0) {
        console.log(`  ${a.inv} fila ${a.fila}: ya estaba`);
        continue;
      }
      const [cuenta]: {
        id: string;
        total: string;
        pagado: string;
        estado: string;
      }[] = await ds.query(
        `SELECT ar.id, ar.total_amount AS total, ar.paid_amount AS pagado, s.status AS estado
           FROM sales s LEFT JOIN accounts_receivable ar ON ar.sale_id = s.id
          WHERE s.tenant_id = $1 AND s.invoice_number = $2
          ORDER BY ar.created_at LIMIT 1`,
        [t, a.inv],
      );
      if (!cuenta) {
        avisos.push(`${a.inv} (fila ${a.fila}): la factura no existe`);
        continue;
      }
      if (!cuenta.id) {
        avisos.push(
          `${a.inv} (fila ${a.fila}, RC ${a.rc ?? '—'}, $${a.monto}): venta sin cuenta por cobrar (se cobró de contado); no se inserta`,
        );
        continue;
      }
      if (cuenta.estado === 'CANCELLED') {
        avisos.push(
          `${a.inv} (fila ${a.fila}): la venta está anulada; no se inserta`,
        );
        continue;
      }
      const debe =
        Math.round((Number(cuenta.total) - Number(cuenta.pagado)) * 100) / 100;
      if (debe <= 0) {
        avisos.push(
          `${a.inv} (fila ${a.fila}, RC ${a.rc ?? '—'}, $${a.monto}): la factura ya estaba pagada; no se inserta`,
        );
        continue;
      }
      let monto = a.monto;
      if (monto > debe + 0.005) {
        avisos.push(
          `${a.inv} (fila ${a.fila}, RC ${a.rc ?? '—'}): el Excel dice $${a.monto} y la factura debe $${debe}; se abona $${debe}`,
        );
        monto = debe;
      }
      const pagadoDespues =
        Math.round((Number(cuenta.pagado) + monto) * 100) / 100;
      const saldada = Math.abs(pagadoDespues - Number(cuenta.total)) < 0.005;
      console.log(
        `  ${a.inv}: ${aplicar ? 'inserto' : 'insertaría'} $${monto} (RC ${a.rc ?? '—'}, ${a.fecha ?? 'sin fecha'})${saldada ? ' → queda pagada' : ''}`,
      );
      insertados++;
      total += monto;
      if (!aplicar) continue;
      await ds.transaction(async (m) => {
        await m.query(
          `INSERT INTO accounts_receivable_payments (tenant_id, account_receivable_id, amount, method, reference, notes, created_at)
           VALUES ($1, $2, $3, 'EFECTIVO', $4, $5, $6)`,
          [
            t,
            cuenta.id,
            monto,
            a.rc,
            nota,
            a.fecha ? `${a.fecha}T12:00:00-05:00` : new Date().toISOString(),
          ],
        );
        await m.query(
          `UPDATE accounts_receivable SET paid_amount = $2, is_fully_paid = $3, fully_paid_at = CASE WHEN $3 THEN COALESCE(fully_paid_at, now()) ELSE fully_paid_at END WHERE id = $1`,
          [cuenta.id, pagadoDespues, saldada],
        );
      });
    }
    console.log(
      `\n${aplicar ? 'Insertados' : 'Se insertarían'} ${insertados} abonos por $${total.toLocaleString('es-CO')}`,
    );
    if (avisos.length) {
      console.log(`\nAvisos (${avisos.length}):`);
      for (const v of avisos) console.log('  - ' + v);
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
