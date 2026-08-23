import { BARCODE_LIMITS, isValidBarcode } from './barcode.util.js';
import {
  ConsecutivoAgotadoError,
  prefijoDelDia,
} from './consecutivo-del-dia.js';

/**
 * Dónde caben las etiquetas que se van a crear hoy.
 *
 * ─── El problema ─────────────────────────────────────────────────────────
 *
 * El código de un par es `AAMMDD | orden(4) | renglón(3) | unidad(3)` más el
 * verificador. Para lo que entra **sin orden de compra** —ajustes, ingresos
 * directos, devoluciones, recepción de compra por ítems— el tramo de orden va
 * en ceros y el renglón hace de consecutivo del día.
 *
 * Cada movimiento tomaba **un renglón entero**, creara una etiqueta o
 * novecientas. Los 999 puestos de unidad de ese renglón se perdían, y el tope
 * del día no era de 999 pares sino de **999 movimientos** — sumando todas las
 * bodegas de la tienda.
 *
 * Se alcanzó de verdad: 36.330 códigos en una jornada dejaron a la tienda sin
 * poder etiquetar mercancía por **ningún** camino hasta el día siguiente. Ni
 * recibir una compra, ni ajustar inventario, ni ingresar cajas.
 *
 * ─── El arreglo ──────────────────────────────────────────────────────────
 *
 * Las etiquetas llenan el renglón que está abierto y solo pasan al siguiente
 * cuando ese se llena. La capacidad del día pasa de 999 movimientos a
 * **998.001 pares** (999 × 999), sin tocar el formato: mismos 17 dígitos,
 * mismo verificador, mismas etiquetas ya impresas.
 *
 * De paso arregla un segundo defecto: un movimiento de más de 999 unidades no
 * cabía en ningún renglón y reventaba con «la secuencia de bulto 1000 no cabe
 * en el código de barras». Ahora se reparte.
 *
 * **Lo que no cambia**: los códigos de una orden de compra recibida por cajas
 * llevan el número de la orden en el tramo de orden y su propio renglón. Ese
 * camino nunca tuvo el problema y no se toca — meter al ledger en ese espacio
 * sí habría colisionado, porque dos pares distintos podrían acabar con el
 * mismo código impreso.
 */

export interface TramoDeEtiquetas {
  /** Renglón del día, de 1 a 999. */
  renglon: number;
  /** Primera unidad libre dentro de ese renglón, de 1 a 999. */
  desdeUnidad: number;
  /** Cuántas etiquetas van en este tramo. */
  cuantas: number;
}

/** Largo de un código nuestro: 16 de cuerpo más el verificador. */
const LARGO = 17;

/**
 * Reparte `cantidad` etiquetas en los renglones del día que tengan espacio.
 *
 * Solo mira los códigos que son **nuestros**: nuestro largo, nuestro prefijo
 * del día y nuestro verificador. Los de demachine son de 18 dígitos y sin
 * verificador, conviven en la misma tabla porque son los que están impresos en
 * las cajas físicas, y uno de ellos que cayera en el prefijo empujaría el
 * consecutivo sin motivo.
 *
 * Lanza `ConsecutivoAgotadoError` si no cabe **todo**: registrar media entrega
 * dejaría pares en bodega sin etiqueta y nadie sabría cuáles.
 */
export function repartirEtiquetasDelDia(
  codigosDelDia: string[],
  fecha: Date,
  cantidad: number,
): TramoDeEtiquetas[] {
  if (cantidad <= 0) return [];

  const prefijo = prefijoDelDia(fecha);
  let renglonMax = 0;
  let unidadesDelMax = 0;

  for (const codigo of codigosDelDia) {
    if (codigo.length !== LARGO) continue;
    if (!codigo.startsWith(prefijo)) continue;
    if (!isValidBarcode(codigo)) continue;
    // Sin comprobar que sean números: `isValidBarcode` ya exigió que el
    // código sea todo dígitos, así que estos dos tramos siempre lo son.
    const renglon = Number(codigo.slice(10, 13));
    const unidad = Number(codigo.slice(13, 16));
    if (renglon > renglonMax) {
      renglonMax = renglon;
      unidadesDelMax = unidad;
    } else if (renglon === renglonMax && unidad > unidadesDelMax) {
      unidadesDelMax = unidad;
    }
  }

  const tramos: TramoDeEtiquetas[] = [];
  let renglon = renglonMax === 0 ? 1 : renglonMax;
  let desdeUnidad = renglonMax === 0 ? 1 : unidadesDelMax + 1;
  let porColocar = cantidad;

  while (porColocar > 0) {
    if (desdeUnidad > BARCODE_LIMITS.unit) {
      renglon += 1;
      desdeUnidad = 1;
    }
    if (renglon > BARCODE_LIMITS.line) throw new ConsecutivoAgotadoError();

    const caben = Math.min(porColocar, BARCODE_LIMITS.unit - desdeUnidad + 1);
    tramos.push({ renglon, desdeUnidad, cuantas: caben });
    porColocar -= caben;
    desdeUnidad += caben;
  }

  return tramos;
}
