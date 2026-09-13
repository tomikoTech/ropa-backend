/**
 * El comprobante de una venta de terceros, listo para el PDF.
 *
 * Una venta de tercero no es una factura: es **un renglón** en `consignments`
 * —un producto, una talla, una cantidad— y un ticket del punto de venta con
 * tres productos son tres filas sueltas, sin nada que las una. Para quien
 * revende, en cambio, ese ticket es *su* factura, y quiere mandarla por
 * WhatsApp igual que una tienda manda la suya.
 *
 * Acá se arma esa factura a partir de las filas: se suman, se les pone un
 * cliente, se les calcula lo cobrado y lo que falta. Es pura y sin base de
 * datos para poder probar lo que importa —que el total y el saldo cuadren—
 * sin levantar nada.
 *
 * Dos decisiones que conviene decir:
 *
 * - **El número.** Las filas no tienen consecutivo, y al PDF le hace falta un
 *   número que el cliente pueda citar. Sale de los ids, así que el mismo
 *   ticket siempre da el mismo número, y dos tickets distintos no chocan.
 * - **El nombre del archivo.** El PDF se sube con nombre fijo para que
 *   regenerarlo reemplace al anterior (ver `DocumentosService.subir`). Con
 *   una fila el nombre es su id; con varias, un resumen de todas —ordenadas,
 *   para que el orden en que llegaron no cambie el nombre—.
 */
import { createHash } from 'crypto';
import { cuentasDeVenta, type AbonoLike, type VentaLike } from '../consignments/terceros-cuentas.js';
import type { DatosDeFactura } from './factura-pdf.js';

export interface FilaDeTercero extends VentaLike {
  id: string;
  thirdPartyName: string;
  productDescription: string;
  size?: string | null;
  color?: string | null;
  clientName?: string | null;
  paymentMethod?: string | null;
  saleDate: Date | string;
  notes?: string | null;
}

/** Ids en un orden que no depende de cómo llegaron. */
const ordenados = (ids: string[]): string[] => [...new Set(ids)].sort();

/**
 * «VT-3F9A2C1B»: corto, en mayúsculas, el mismo para el mismo grupo.
 *
 * Ocho caracteres hexadecimales son cuatro mil millones de combinaciones: de
 * sobra para que dos tickets de una misma persona no se repitan, y lo bastante
 * corto para dictarlo por teléfono.
 */
export function numeroDelComprobante(ids: string[]): string {
  const resumen = createHash('sha1').update(ordenados(ids).join('|')).digest('hex');
  return `VT-${resumen.slice(0, 8).toUpperCase()}`;
}

/** Dónde vive el PDF dentro de `documentos/<tienda>/`. */
export function nombreDelArchivo(ids: string[]): string {
  const lista = ordenados(ids);
  if (lista.length === 1) return `terceros/${lista[0]}.pdf`;
  const resumen = createHash('sha1').update(lista.join('|')).digest('hex');
  return `terceros/${resumen.slice(0, 24)}.pdf`;
}

/**
 * Arma la factura. `abonos` trae los de cada fila, por id; una fila sin
 * entrada es una fila sin abonos.
 */
export function facturaDeTerceros(
  filas: FilaDeTercero[],
  abonos: Map<string, AbonoLike[]>,
): DatosDeFactura {
  if (filas.length === 0) throw new Error('Una factura sin renglones no es una factura');

  let totalCents = 0;
  let cobradoCents = 0;
  for (const fila of filas) {
    const c = cuentasDeVenta(fila, abonos.get(fila.id) ?? []);
    totalCents += c.totalVentaCents;
    cobradoCents += c.cobradoClienteCents;
  }
  const total = totalCents / 100;
  // Lo cobrado no puede pasar del total: un abono de más es un error de
  // digitación, no un saldo a favor que se le imprima al cliente.
  const pagado = Math.min(total, cobradoCents / 100);

  // El cliente y la fecha son los de la primera fila: en un ticket son los
  // mismos para todas. Si alguien junta filas de clientes distintos, sale el
  // primero y no una mezcla.
  const primera = filas[0];
  const fechas = filas.map((f) => new Date(f.saleDate).getTime()).filter((t) => !Number.isNaN(t));
  const fecha = new Date(fechas.length ? Math.min(...fechas) : Date.now()).toISOString();

  return {
    numero: numeroDelComprobante(filas.map((f) => f.id)),
    fecha,
    cliente: primera.clientName?.trim() || 'Consumidor final',
    renglones: filas.map((f) => ({
      nombre: f.productDescription,
      detalle: [f.size, f.color].filter(Boolean).join(' / ') || null,
      cantidad: f.quantity,
      precioUnitario: Number(f.salePrice) || 0,
      total: cuentasDeVenta(f, []).totalVentaCents / 100,
    })),
    subtotal: total,
    descuento: 0,
    iva: 0,
    total,
    pagado,
    saldo: total - pagado,
    notas: filas.map((f) => f.notes?.trim()).filter(Boolean).join(' · ') || null,
  };
}
