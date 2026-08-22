/**
 * Qué precio lleva un renglón de la venta.
 *
 * Tres reglas que se pisan entre sí:
 *
 *  - **Precio fijo**: el producto se vende a ese valor y punto. Nace de una
 *    frase de tienda: «las cajas que yo vendo, si tienen un precio, eso no
 *    tiene descuento para nadie». No es un mínimo —subirlo también lo rompe—
 *    ni admite descuento, que es bajarlo por la puerta de atrás.
 *  - **Precio mínimo**: un piso. Se puede subir, no bajar.
 *  - **Precio sugerido**: el de la variante si lo tiene, si no el del
 *    producto. Se propone; el vendedor lo puede cambiar.
 *
 * Vive aparte del servicio porque es la regla que decide cuánta plata entra en
 * la caja, y eso hay que poder probarlo hasta el último caso raro sin levantar
 * media aplicación.
 */

export interface ReglaDePrecio {
  /** El del producto. */
  precioProducto: number;
  /** El de la variante, si esa talla o color cuesta distinto. */
  precioVariante: number | null;
  /** Piso de venta. `null` o 0 = sin piso. */
  precioMinimo: number | null;
  /** Si está encendido, el precio no se negocia. */
  precioFijo: boolean;
}

export interface LineaPedida {
  /** Lo que mandó la caja. `undefined` = «el que sugiera el sistema». */
  unitPrice?: number | null;
  discountPercent?: number | null;
}

export interface PrecioResuelto {
  precio?: number;
  /** En palabras de la tienda, para mostrárselo tal cual al cajero. */
  error?: string;
}

/** Un peso de tolerancia: el navegador manda 50000.00000001 y eso no es vender más caro. */
const TOLERANCIA = 0.01;

const enPesos = (valor: number) =>
  `$${Math.round(valor).toLocaleString('es-CO')}`;

export function precioDeLinea(
  regla: ReglaDePrecio,
  linea: LineaPedida,
): PrecioResuelto {
  const sugerido = regla.precioVariante ?? regla.precioProducto;
  const pedido =
    linea.unitPrice === undefined || linea.unitPrice === null
      ? sugerido
      : Number(linea.unitPrice);

  if (pedido < 0) {
    return { error: 'El precio no puede ser negativo.' };
  }

  const descuento = Number(linea.discountPercent) || 0;

  if (regla.precioFijo) {
    if (descuento > 0) {
      return {
        error: `Este producto tiene precio fijo (${enPesos(sugerido)}): no admite descuento.`,
      };
    }
    if (Math.abs(pedido - sugerido) > TOLERANCIA) {
      return {
        error:
          `Este producto tiene precio fijo: se vende a ${enPesos(sugerido)} ` +
          'y no se puede cambiar.',
      };
    }
    // Se devuelve el de la regla y no el pedido: así el centavo de redondeo no
    // se cuela a la factura.
    return { precio: sugerido };
  }

  const minimo = Number(regla.precioMinimo) || 0;
  if (minimo > 0) {
    // Con el descuento aplicado, no el de lista: si no, poner el precio de
    // lista con 50% de descuento se salta el piso por la puerta de atrás.
    const efectivo = pedido * (1 - descuento / 100);
    if (efectivo + 0.0001 < minimo) {
      return {
        error: `No se puede vender por debajo de ${enPesos(minimo)}.`,
      };
    }
  }

  return { precio: pedido };
}
