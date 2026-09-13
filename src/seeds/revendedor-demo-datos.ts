/**
 * Los datos de ejemplo de la cuenta de revendedor, y cómo sembrarlos.
 *
 * Viven aparte porque los usan dos scripts: `revendedor-demo.ts`, que crea la
 * cuenta desde cero, y `reiniciar-revendedor-demo.ts`, que la deja como nueva
 * después de una demostración. Si cada uno tuviera su copia, la cuenta recién
 * creada y la reiniciada enseñarían cosas distintas.
 *
 * Lo que un revendedor de calzado vende en una semana normal. Se repiten pares
 * a propósito —la misma referencia en dos tallas, y una vendida dos veces—
 * para que la libreta enseñe lo que hace: agrupar y recordar el último precio.
 * Hay ventas sin cobrar, sin pagarle al dueño y una abonada a medias, para
 * que las carteras y el historial de abonos tengan qué mostrar. Y dos gastos,
 * para que la ganancia neta no sea igual a la utilidad.
 */
import type { EntityManager } from 'typeorm';
import { claveDeProducto } from '../consignments/producto-de-tercero.js';

export const VENTAS = [
  ['Don Jose', 'Nike Air Force 1', '40', 'Blanco', 95000, 150000, 'EFECTIVO'],
  ['Don Jose', 'Nike Air Force 1', '42', 'Blanco', 95000, 150000, 'EFECTIVO'],
  ['Don Jose', 'Nike Air Force 1', '40', 'Blanco', 98000, 155000, 'TRANSFERENCIA'],
  ['Don Jose', 'Adidas Superstar', '41', 'Negro', 88000, 140000, 'EFECTIVO'],
  ['Marcela', 'Puma Suede', '38', 'Azul', 72000, 120000, 'EFECTIVO'],
  ['Marcela', 'Puma Suede', '39', 'Azul', 72000, 120000, 'TRANSFERENCIA'],
  ['Marcela', 'Sandalia Ipanema', '37', 'Rosado', 28000, 55000, 'EFECTIVO'],
  ['El Primo', 'Nike Dunk Low', '43', 'Verde', 130000, 195000, 'EFECTIVO'],
  ['El Primo', 'Nike Dunk Low', '41', 'Verde', 130000, 190000, 'CREDITO'],
  ['El Primo', 'Crocs Clasico', '40', 'Negro', 60000, 98000, 'EFECTIVO'],
] as const;

/** Cuántos días atrás cae cada venta, para que el historial no sea de un día. */
const DIAS_ATRAS = [0, 0, 1, 1, 2, 3, 3, 5, 6, 6];

/** Cuáles quedan sin cobrarle al cliente o sin pagarle al dueño. */
const SIN_COBRAR = new Set([2, 8]);
const SIN_PAGAR = new Set([0, 4, 8]);
/** La que el cliente abonó a medias: índice → lo que ya pagó. */
const ABONO_PARCIAL = new Map<number, number>([[8, 100000]]);

const GASTOS = [
  ['Transporte para recoger la mercancía', 24000, 2],
  ['Bolsas y empaque', 12000, 5],
] as const;

/** El separador de la clave de la libreta (ver `claveDeProducto`). */
const SEPARADOR = String.fromCharCode(1);

const hace = (dias: number): Date => {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return f;
};

/**
 * Siembra las ventas, sus abonos, la libreta y los gastos. Se llama dentro de
 * una transacción, sobre un tenant que ya existe y ya tiene su usuario.
 */
export async function sembrarDatosDeDemo(
  m: EntityManager,
  tenantId: string,
  usuarioId: string,
): Promise<{ ventas: number; gastos: number }> {
  const libreta = new Map<
    string,
    { costo: number; precio: number; veces: number; fecha: Date }
  >();
  for (let i = 0; i < VENTAS.length; i++) {
    const [duenyo, descripcion, talla, color, costo, precio, metodo] = VENTAS[i];
    const fecha = hace(DIAS_ATRAS[i]);
    const cobrada = !SIN_COBRAR.has(i);
    const [venta]: { id: string }[] = await m.query(
      `INSERT INTO consignments
         (tenant_id, user_id, third_party_name, product_description, size, color,
          quantity, cost_price, sale_price, client_name, client_paid, supplier_paid,
          payment_method, sale_date)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,'',$9,$10,$11,$12) RETURNING id`,
      [tenantId, usuarioId, duenyo, descripcion, talla, color, costo, precio,
        cobrada, !SIN_PAGAR.has(i), metodo, fecha],
    );
    // Los abonos, para que el desglose por método y el historial tengan de
    // dónde salir: lo cobrado de contado nace como abono con su método, igual
    // que cuando se vende desde el punto de venta.
    const abonos: [string, number, string][] = [];
    if (cobrada) abonos.push(['CLIENT', precio, metodo]);
    else if (ABONO_PARCIAL.has(i)) abonos.push(['CLIENT', ABONO_PARCIAL.get(i)!, 'EFECTIVO']);
    if (!SIN_PAGAR.has(i)) abonos.push(['SUPPLIER', costo, 'EFECTIVO']);
    for (const [lado, monto, metodoDelAbono] of abonos) {
      await m.query(
        `INSERT INTO consignment_payments
           (tenant_id, consignment_id, lado, amount, method, paid_at, user_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, venta.id, lado, monto, metodoDelAbono, fecha, usuarioId,
          lado === 'CLIENT' && !cobrada ? 'Abono parcial' : 'Pago de contado al registrar la venta'],
      );
    }
    const clave = claveDeProducto({
      thirdPartyName: duenyo,
      productDescription: descripcion,
      size: talla,
      color,
    });
    const previo = libreta.get(clave);
    libreta.set(clave, { costo, precio, veces: (previo?.veces ?? 0) + 1, fecha });
  }
  for (const [clave, d] of libreta) {
    const [duenyo, descripcion, talla, color] = clave.split(SEPARADOR);
    const original = VENTAS.find(
      (v) => v[0].toLowerCase() === duenyo && v[1].toLowerCase() === descripcion,
    )!;
    await m.query(
      `INSERT INTO third_party_products
         (tenant_id, clave, third_party_name, product_description, size, color,
          last_cost_price, last_sale_price, times_sold, last_sold_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tenantId, clave, original[0], original[1], talla, color ? original[3] : '',
        d.costo, d.precio, d.veces, d.fecha],
    );
  }
  for (let i = 0; i < GASTOS.length; i++) {
    const [descripcion, monto, dias] = GASTOS[i];
    await m.query(
      `INSERT INTO expenses
         (tenant_id, expense_number, description, amount, payment_method, expense_date, created_by)
       VALUES ($1,$2,$3,$4,'EFECTIVO',$5,$6)`,
      [tenantId, `GA-${String(i + 1).padStart(6, '0')}`, descripcion, monto,
        hace(dias).toISOString().slice(0, 10), usuarioId],
    );
  }
  return { ventas: VENTAS.length, gastos: GASTOS.length };
}
