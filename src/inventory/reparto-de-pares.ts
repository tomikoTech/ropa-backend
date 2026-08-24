import {
  BARCODE_LIMITS,
  buildStockBarcode,
  isValidBarcode,
} from './barcode.util.js';

/**
 * Dónde se numeran los pares que salen de abrir una caja.
 *
 * Los pares continúan la numeración **del renglón de su propia caja**, y eso
 * es a propósito: el código de un par queda a un dígito del de la caja de la
 * que salió, así que en la bodega se lee el lote a ojo.
 *
 * Pero el renglón tiene 999 puestos y nadie los estaba contando: la apertura
 * armaba el código concatenando `String(secuencia).padStart(3, '0')`, que al
 * llegar a 1000 **no falla: crece**. El resultado eran códigos de 18 dígitos
 * en un formato de 17, que ningún lector reconoce y que `parseStockBarcode`
 * devuelve como nulos. Se creaban en silencio.
 *
 * Pasa cuando un renglón ya viene lleno: un renglón de compra con muchas
 * cajas, o —desde que los ingresos directos comparten renglón para no gastar
 * uno por movimiento— una caja ingresada a mano en un renglón concurrido.
 *
 * Lo que no cabe **no bloquea la apertura**: se le pide un tramo nuevo al
 * reparto del día. Un par con código de otro renglón sigue siendo el par
 * correcto —lo que lo ata a su caja es `parentUnitId`, no el número—; una caja
 * que no se puede abrir deja la mercancía sin vender.
 */

export interface TramoDePares {
  /** Primer puesto de unidad libre en el renglón de la caja. */
  desdeUnidad: number;
  cuantas: number;
}

export interface RepartoDePares {
  /** Lo que cabe continuando el renglón de la caja. Nulo si no cabe nada. */
  enElRenglon: TramoDePares | null;
  /** Lo que hay que pedirle al reparto del día. */
  faltan: number;
}

/**
 * @param ultimaUnidadUsada mayor puesto ya emitido en el renglón de la caja
 *        (cajas y pares comparten el mismo espacio).
 */
function continuarElRenglon(
  ultimaUnidadUsada: number,
  cantidad: number,
): RepartoDePares {
  if (cantidad <= 0) return { enElRenglon: null, faltan: 0 };

  const desdeUnidad = Math.max(0, Math.trunc(ultimaUnidadUsada)) + 1;
  const libres = BARCODE_LIMITS.unit - desdeUnidad + 1;
  if (libres <= 0) return { enElRenglon: null, faltan: cantidad };

  const cuantas = Math.min(cantidad, libres);
  return {
    enElRenglon: { desdeUnidad, cuantas },
    faltan: cantidad - cuantas,
  };
}

/** Un tramo del reparto del día, tal como lo devuelve el ledger. */
export interface TramoDelDia {
  renglon: number;
  desdeUnidad: number;
  cuantas: number;
}

/**
 * Los cuerpos de 16 dígitos de todos los pares de una apertura, en orden.
 *
 * Primero los que continúan el renglón de la caja, después los del tramo
 * nuevo. El orden importa: la apertura los reparte entre las tallas de la
 * curva tal como vienen, así que los pares de la primera talla son los que
 * quedan más cerca del código de su caja.
 */
export function codigosDeLaApertura(params: {
  /** Fecha, orden y renglón de la caja: los 13 primeros dígitos de su código. */
  cuerpoDelRenglon: string;
  enElRenglon: TramoDePares | null;
  tramosDelDia: TramoDelDia[];
  fecha: Date;
}): string[] {
  const codigos: string[] = [];
  const { enElRenglon } = params;
  if (enElRenglon) {
    for (let i = 0; i < enElRenglon.cuantas; i++) {
      codigos.push(
        params.cuerpoDelRenglon +
          String(enElRenglon.desdeUnidad + i).padStart(3, '0'),
      );
    }
  }
  for (const tramo of params.tramosDelDia) {
    for (let i = 0; i < tramo.cuantas; i++) {
      codigos.push(
        buildStockBarcode({
          date: params.fecha,
          // Tramo reservado para lo que entra sin orden de compra.
          orderSequence: 0,
          lineConsecutive: tramo.renglon,
          unitSequence: tramo.desdeUnidad + i,
        }),
      );
    }
  }
  return codigos;
}

/** Largo de un código nuestro, con su dígito verificador. */
const LARGO = 17;

/**
 * El tramo de orden que el ledger administra: lo que entra sin orden de compra.
 */
const ORDEN_DEL_DIA = '0000';

/**
 * De dónde salen los códigos de los pares de **esta** caja.
 *
 * Hay dos espacios de numeración y la regla es que no se pisen:
 *
 * - El de una **orden de compra** (`orden ≠ 0000`) lo numera su propio
 *   renglón. Ahí sí conviene continuar: el par queda a un dígito de su caja.
 * - El del **día** (`orden = 0000`) lo administra el ledger, con su cerrojo.
 *   Tomar códigos a mano de ahí es lo que hace que dos pares distintos salgan
 *   con la misma etiqueta: el ledger lee la base para saber qué está libre, y
 *   lo que todavía no se ha guardado no lo ve.
 *
 * Y una caja con un código que no es nuestro —los de demachine son de 18
 * dígitos y sin verificador— tampoco puede prestar su renglón: sus dígitos no
 * significan lo mismo.
 */
export function paresDeLaCaja(params: {
  /** El código impreso de la caja, con verificador. */
  codigoDeLaCaja: string;
  /** Mayor puesto ya emitido en el renglón de la caja. */
  ultimaUnidadUsada: number;
  cantidad: number;
}): RepartoDePares {
  const { codigoDeLaCaja } = params;
  // Se normaliza una sola vez, acá: sin esto una cantidad absurda saldría como
  // un `faltan` negativo por la rama del día, y quien la reciba le pediría al
  // ledger «menos tres etiquetas».
  const cantidad = Math.max(0, Math.trunc(params.cantidad));

  const esNuestro =
    codigoDeLaCaja.length === LARGO && isValidBarcode(codigoDeLaCaja);
  const enElEspacioDelDia =
    codigoDeLaCaja.slice(6, 10) === ORDEN_DEL_DIA;
  if (!esNuestro || enElEspacioDelDia) {
    return { enElRenglon: null, faltan: cantidad };
  }
  return continuarElRenglon(params.ultimaUnidadUsada, cantidad);
}
