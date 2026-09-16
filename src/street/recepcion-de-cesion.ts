/**
 * Recibir una cesión por partes.
 *
 * Ceder es prestar: a una persona o a un local, sin saber todavía si va a
 * ser venta. La mercancía sale del inventario **como cesión** —no como
 * venta— y vuelve de a poco: un par regresa el martes, otro se vendió el
 * jueves, la caja sigue prestada. El cuadre de antes era de una sola vez y
 * lo que no se declaraba quedaba como faltante; con eso, marcar un par
 * vendido obligaba a dar por perdido lo que seguía prestado.
 *
 * Acá cada renglón tiene tres cuentas —vendido, volvió, en préstamo— y cada
 * recepción suma sobre lo anterior. La cesión se cierra sola cuando no queda
 * nada en préstamo, o a mano («cerrar con faltantes») cuando lo que falta se
 * da por perdido.
 *
 * Puro: valida y suma; el servicio mueve el inventario y crea la venta.
 */

export interface RenglonCedido {
  id: string;
  productName: string;
  variantSize: string;
  variantColor: string;
  quantity: number;
  quantitySold: number;
  quantityReturned: number;
}

/** Lo que llega **ahora**: se suma a lo ya recibido. */
export interface LineaDeRecepcion {
  itemId: string;
  sold: number;
  returned: number;
}

export type EstadoDelRenglon = 'EN_PRESTAMO' | 'VENDIDO' | 'VOLVIO' | 'PARCIAL';

/** Cuánto sigue afuera de este renglón. */
export const enPrestamo = (r: RenglonCedido) =>
  Math.max(0, r.quantity - (r.quantitySold ?? 0) - (r.quantityReturned ?? 0));

/** Cómo va cada renglón, para leerlo de un vistazo. */
export function estadoDelRenglon(r: RenglonCedido): EstadoDelRenglon {
  const fuera = enPrestamo(r);
  if (fuera === r.quantity) return 'EN_PRESTAMO';
  if (fuera > 0) return 'PARCIAL';
  if ((r.quantityReturned ?? 0) === r.quantity) return 'VOLVIO';
  if ((r.quantitySold ?? 0) === r.quantity) return 'VENDIDO';
  return 'PARCIAL';
}

/** No queda nada afuera: la cesión se puede cerrar sola. */
export const todoRecibido = (renglones: RenglonCedido[]) =>
  renglones.every((r) => enPrestamo(r) === 0);

const describe = (r: RenglonCedido) => {
  const talla = [r.variantSize, r.variantColor].filter(Boolean).join('/');
  return talla ? `${r.productName} ${talla}` : r.productName;
};

/**
 * Revisa lo que llega contra lo que sigue en préstamo y devuelve **todos** los
 * problemas. No exige que vengan todos los renglones: recibir por partes es el
 * punto.
 */
export function validarRecepcion(
  renglones: RenglonCedido[],
  lineas: LineaDeRecepcion[],
): string[] {
  const errores: string[] = [];
  const porId = new Map(renglones.map((r) => [r.id, r]));
  const vistos = new Set<string>();
  let algo = false;
  for (const l of lineas) {
    const r = porId.get(l.itemId);
    if (!r) {
      errores.push('Hay un renglón que no pertenece a esta cesión.');
      continue;
    }
    if (vistos.has(l.itemId)) {
      errores.push(`"${describe(r)}" viene dos veces; déjalo una sola.`);
      continue;
    }
    vistos.add(l.itemId);
    if (!Number.isInteger(l.sold) || l.sold < 0) {
      errores.push(`"${describe(r)}": lo vendido no puede ser negativo.`);
    }
    if (!Number.isInteger(l.returned) || l.returned < 0) {
      errores.push(`"${describe(r)}": lo que volvió no puede ser negativo.`);
    }
    const ahora = (l.sold || 0) + (l.returned || 0);
    if (ahora > 0) algo = true;
    const fuera = enPrestamo(r);
    if (ahora > fuera) {
      errores.push(
        `"${describe(r)}": entre vendido (${l.sold}) y devuelto (${l.returned}) ` +
          `suman ${ahora}, y solo ${fuera === 1 ? 'queda 1' : `quedan ${fuera}`} en préstamo.`,
      );
    }
  }
  if (!algo && !errores.length) {
    errores.push(
      'No hay nada que recibir: escribe cuánto volvió o cuánto se vendió.',
    );
  }
  return errores;
}

/** Los renglones después de sumar lo que llega. */
export function aplicarRecepcion(
  renglones: RenglonCedido[],
  lineas: LineaDeRecepcion[],
): RenglonCedido[] {
  const porId = new Map(lineas.map((l) => [l.itemId, l]));
  return renglones.map((r) => {
    const l = porId.get(r.id);
    if (!l) return r;
    return {
      ...r,
      quantitySold: (r.quantitySold ?? 0) + (l.sold || 0),
      quantityReturned: (r.quantityReturned ?? 0) + (l.returned || 0),
    };
  });
}

/**
 * De un cuadre «de totales» (la pantalla vieja mandaba lo vendido y lo
 * devuelto en total) a lo que llega ahora: la diferencia con lo ya recibido.
 */
export function deltasDesdeTotales(
  renglones: RenglonCedido[],
  totales: LineaDeRecepcion[],
): LineaDeRecepcion[] {
  const porId = new Map(renglones.map((r) => [r.id, r]));
  return totales.map((t) => {
    const r = porId.get(t.itemId);
    return {
      itemId: t.itemId,
      sold: Math.max(0, (t.sold || 0) - (r?.quantitySold ?? 0)),
      returned: Math.max(0, (t.returned || 0) - (r?.quantityReturned ?? 0)),
    };
  });
}
