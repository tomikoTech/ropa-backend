/**
 * Carga el Excel «PROVEEDORES 3 DE OCTUBRE» de Andrea: la cartera con los
 * proveedores (fecha, n.º de factura, proveedor, valor, abonos, saldo).
 *
 * Es su libro, no una lista de compras: «todo lo que yo cargue de aquí para
 * allá va fuera de este archivo». Por eso cada fila nace como una orden de
 * compra **sin renglones** (no mueve inventario) con su cuenta por pagar, y
 * su abono como un pago.
 *
 * Ya había 22 órdenes cargadas a mano en julio, con inventario. Se casan con
 * el Excel por n.º de factura; si no, por proveedor (con alias: ella escribe
 * «ANDRES VARGAS» donde el sistema dice «VS») y mismo valor. A las casadas
 * se les ajusta la cuenta por pagar a lo que dice el Excel (valor y abonos,
 * agregando el pago que falte; nunca borrando). Lo que no casa se lista.
 *
 *     PLAN=plan-proveedores.json node dist/seeds/importar-proveedores-2026-10-03.js
 *     MODE=apply PLAN=... node dist/seeds/importar-proveedores-2026-10-03.js
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { AppDataSource } from '../config/data-source.js';

const MARCADOR = '[import:proveedores-xlsx-2026-10-03]';
const SLUG = process.env.TENANT?.trim() || 'distriamber';
/** Como los llama Andrea → como están en el sistema. */
const ALIAS: Record<string, string> = {
  'ANDRES VARGAS': 'VS',
  'PG ANGELA': 'ENVASES PG',
  'JUAN DIEGO MUNDO PERFUMES': 'MUNDO PERFUMES',
  'PERFUMART CARMENZA BOGOTA': 'PARFUMART SOLUCIONES',
  BENEIDA: 'PERFUMERIA BENEIDA',
  'JHESENCE GLAS': 'JHESSENCE GLAS',
  'JHESSENCE GLASS': 'JHESSENCE GLAS',
  'CARLOS MEDELLIN': 'JORDAN RIVER',
};
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

interface Fila {
  fila: number;
  fecha: string | null;
  factura: string | null;
  proveedor: string;
  valor: number;
  abonos: number;
  saldo: number;
}
interface Orden {
  id: string;
  supplier_id: string;
  proveedor: string;
  factura: string;
  total: number;
  ap_id: string | null;
  ap_amount: number;
  ap_paid: number;
}

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const filas = JSON.parse(readFileSync(process.env.PLAN!, 'utf8')) as Fila[];
  await AppDataSource.initialize();
  const ds = AppDataSource;
  const avisos: string[] = [];
  try {
    const [{ id: t }] = await ds.query(
      `SELECT id FROM tenants WHERE slug = $1`,
      [SLUG],
    );
    const [{ id: bodega }] = await ds.query(
      `SELECT w.id FROM warehouses w WHERE w.tenant_id = $1 AND w.name = 'DistriAmber'`,
      [t],
    );
    const [{ id: admin }] = await ds.query(
      `SELECT u.id FROM users u WHERE u.tenant_id = $1 AND u.username = 'admin'`,
      [t],
    );
    const proveedores: { id: string; name: string }[] = await ds.query(
      `SELECT id, name FROM suppliers WHERE tenant_id = $1`,
      [t],
    );
    const porNombre = new Map(proveedores.map((p) => [norm(p.name), p]));
    const ordenes: Orden[] = (
      await ds.query(
        `SELECT po.id, po.supplier_id, s.name AS proveedor, coalesce(po.supplier_invoice_number,'') AS factura, po.total::float AS total,
                ap.id AS ap_id, coalesce(ap.amount,0)::float AS ap_amount, coalesce(ap.paid_amount,0)::float AS ap_paid
           FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
          WHERE po.tenant_id = $1 AND po.status <> 'CANCELLED'`,
        [t],
      )
    ).map((o: Orden) => ({ ...o, factura: String(o.factura).trim() }));
    const casadas = new Set<string>();
    console.log(
      `${aplicar ? 'APLICANDO' : 'ENSAYO'} en ${SLUG}: ${filas.length} filas del Excel, ${ordenes.length} órdenes ya en el sistema`,
    );

    // Filas repetidas (mismo proveedor, valor y abono, sin factura): se carga una.
    const vistas = new Set<string>();
    const unicas = filas.filter((f) => {
      const k = `${norm(ALIAS[norm(f.proveedor)] ?? f.proveedor)}|${f.factura ?? ''}|${f.valor}|${f.abonos}`;
      if (vistas.has(k)) {
        avisos.push(
          `fila ${f.fila}: repetida (${f.proveedor} ${f.valor.toLocaleString('es-CO')}); no se carga dos veces`,
        );
        return false;
      }
      vistas.add(k);
      return true;
    });

    let nuevas = 0,
      valorNuevas = 0,
      pagosNuevos = 0,
      valorPagos = 0,
      ajustadas = 0,
      creados = 0;
    for (const f of unicas) {
      const nombre = ALIAS[norm(f.proveedor)] ?? f.proveedor;
      let proveedor = porNombre.get(norm(nombre));
      // 1) por n.º de factura; 2) por proveedor y mismo valor.
      let orden = f.factura
        ? ordenes.find((o) => o.factura === f.factura && !casadas.has(o.id))
        : undefined;
      if (!orden && proveedor)
        orden = ordenes.find(
          (o) =>
            o.supplier_id === proveedor!.id &&
            Math.abs(o.total - f.valor) < 1 &&
            !casadas.has(o.id),
        );
      if (orden) {
        casadas.add(orden.id);
        const cambios: string[] = [];
        if (Math.abs(orden.ap_amount - f.valor) >= 1)
          cambios.push(
            `valor ${orden.ap_amount.toLocaleString('es-CO')} → ${f.valor.toLocaleString('es-CO')}`,
          );
        const delta = Math.round(f.abonos - orden.ap_paid);
        if (delta > 0) cambios.push(`abono +${delta.toLocaleString('es-CO')}`);
        if (delta < 0)
          avisos.push(
            `fact ${f.factura ?? '—'} ${orden.proveedor}: el sistema tiene abonado ${orden.ap_paid.toLocaleString('es-CO')} y el Excel ${f.abonos.toLocaleString('es-CO')}; no se quita nada`,
          );
        if (!cambios.length) {
          continue;
        }
        ajustadas++;
        console.log(
          `  ${(f.factura ?? '—').padStart(6)} ${orden.proveedor.padEnd(22)} ya existía: ${cambios.join(', ')}`,
        );
        if (!aplicar || !orden.ap_id) continue;
        await ds.transaction(async (m) => {
          const pagado = Math.max(orden!.ap_paid, f.abonos);
          const saldada = pagado >= f.valor - 0.5;
          await m.query(
            `UPDATE accounts_payable SET amount = $2, paid_amount = $3, is_paid = $4, paid_at = CASE WHEN $4 THEN coalesce(paid_at, now()) ELSE NULL END, notes = coalesce(notes,'') || ' ' || $5 WHERE id = $1`,
            [
              orden!.ap_id,
              f.valor,
              pagado,
              saldada,
              `${MARCADOR} fila ${f.fila}`,
            ],
          );
          if (delta > 0) {
            await m.query(
              `INSERT INTO accounts_payable_payments (tenant_id, accounts_payable_id, amount, method, reference, notes, created_at, user_id) VALUES ($1,$2,$3,'EFECTIVO','Excel proveedores 3 oct',$4,$5,$6)`,
              [
                t,
                orden!.ap_id,
                delta,
                `${MARCADOR} abono fila ${f.fila}`,
                f.fecha
                  ? `${f.fecha}T12:00:00-05:00`
                  : new Date().toISOString(),
                admin,
              ],
            );
            pagosNuevos++;
            valorPagos += delta;
          }
          if (f.factura)
            await m.query(
              `UPDATE purchase_orders SET supplier_invoice_number = coalesce(nullif(supplier_invoice_number,''), $2) WHERE id = $1`,
              [orden!.id, f.factura],
            );
        });
        continue;
      }
      // Nueva: proveedor (creándolo si no está), orden sin renglones, cuenta por pagar y abono.
      nuevas++;
      valorNuevas += f.valor;
      if (f.abonos > 0) {
        pagosNuevos++;
        valorPagos += f.abonos;
      }
      console.log(
        `  ${(f.factura ?? '—').padStart(6)} ${nombre.padEnd(22)} nueva: ${f.valor.toLocaleString('es-CO')} abonado ${f.abonos.toLocaleString('es-CO')} saldo ${f.saldo.toLocaleString('es-CO')}${proveedor ? '' : ' (proveedor nuevo)'}`,
      );
      if (!aplicar) continue;
      await ds.transaction(async (m) => {
        if (!proveedor) {
          const [p] = await m.query(
            `INSERT INTO suppliers (tenant_id, name, is_active) VALUES ($1, $2, true) RETURNING id, name`,
            [t, nombre],
          );
          proveedor = p;
          porNombre.set(norm(nombre), p);
          creados++;
        }
        const fecha = f.fecha
          ? `${f.fecha}T12:00:00-05:00`
          : new Date().toISOString();
        const [po] = await m.query(
          `INSERT INTO purchase_orders (tenant_id, order_number, supplier_id, warehouse_id, created_by, status, total, subtotal, supplier_invoice_number, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'RECEIVED', $6, $6, $7, $8, $9, $9) RETURNING id`,
          [
            t,
            `IMP-PROV-${String(f.fila).padStart(3, '0')}`,
            proveedor!.id,
            bodega,
            admin,
            f.valor,
            f.factura,
            `${MARCADOR} fila ${f.fila}: factura histórica, sin renglones (no mueve inventario)`,
            fecha,
          ],
        );
        const saldada = f.saldo <= 0;
        const [ap] = await m.query(
          `INSERT INTO accounts_payable (tenant_id, purchase_order_id, amount, paid_amount, due_date, is_paid, paid_at, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, ($8::timestamptz + interval '30 days')::date, $5, $6, $7, $8, $8) RETURNING id`,
          [
            t,
            po.id,
            f.valor,
            f.abonos,
            saldada,
            saldada ? fecha : null,
            `${MARCADOR} fila ${f.fila}`,
            fecha,
          ],
        );
        if (f.abonos > 0) {
          await m.query(
            `INSERT INTO accounts_payable_payments (tenant_id, accounts_payable_id, amount, method, reference, notes, created_at, user_id) VALUES ($1,$2,$3,'EFECTIVO','Excel proveedores 3 oct',$4,$5,$6)`,
            [
              t,
              ap.id,
              f.abonos,
              `${MARCADOR} abono fila ${f.fila}`,
              fecha,
              admin,
            ],
          );
        }
      });
    }
    for (const o of ordenes)
      if (!casadas.has(o.id))
        avisos.push(
          `orden del sistema sin pareja en el Excel: ${o.proveedor} fact ${o.factura || '—'} ${o.total.toLocaleString('es-CO')} (abonado ${o.ap_paid.toLocaleString('es-CO')}); se deja como está`,
        );
    console.log(
      `\n${aplicar ? 'Hecho' : 'Se haría'}: ${nuevas} facturas nuevas por ${valorNuevas.toLocaleString('es-CO')}; ${ajustadas} existentes ajustadas; ${pagosNuevos} abonos por ${valorPagos.toLocaleString('es-CO')}${creados ? `; ${creados} proveedores creados` : ''}`,
    );
    if (avisos.length) {
      console.log(`\nAvisos (${avisos.length}):`);
      avisos.forEach((a) => console.log('  - ' + a));
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
