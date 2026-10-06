/**
 * Cuánto se rebajó, renglón por renglón y en total: lo que la factura tiene
 * que decir del descuento.
 *
 * Lo pidió Distri Amber con el cliente enfrente: «el cliente ve 40.000 y dice
 * "me la estás vendiendo en 40", por más que abajo diga 15 % incluido». Así
 * que cada renglón enseña el precio real **tachado** y al lado lo que quedó,
 * y al pie dice en pesos y en porcentaje cuánto se le descontó en total.
 *
 * Hay tres maneras de rebajar en MiPinta y las tres caen acá:
 *
 *  - **Descuento por línea** (`discount_percent`): el precio unitario guardado
 *    es el de antes y el total de línea el de después.
 *  - **Precio editado a mano** por debajo del de lista (`list_unit_price`):
 *    no hay porcentaje guardado, pero sí hubo rebaja.
 *  - **Descuento general** de la venta (`discount_amount`): va sobre el total.
 *
 * Ojo: `discount_amount` es **todo** lo que la venta rebajó, renglones
 * incluidos (`total = subtotal − discount_amount`, y el POS lo llena con la
 * suma de las líneas). El descuento general es solo lo que esa cifra no
 * explica con los renglones. La factura FE-000810 de Distri Amber salió con
 * «DESCUENTO 40 %» por sumar las dos veces el mismo 20 %.
 *
 * Es la misma regla para el PDF de WhatsApp, la impresión del navegador y la
 * pantalla; su espejo es `ropa-frontend/src/lib/descuento-de-la-factura.ts`.
 * Todo en pesos enteros: lo que se imprime.
 */

export interface RenglonConDescuento {
  cantidad: number;
  /** Precio unitario antes del descuento por línea. */
  precioUnitario: number;
  /** Precio de lista (catálogo) al momento de la venta. Sin él, el unitario. */
  precioDeLista?: number | null;
  /** Descuento por línea, en porcentaje. */
  descuentoPorcentaje?: number | null;
}

export interface DescuentoDelRenglon {
  /** El precio real, el que se tacha. */
  lista: number;
  /** Lo que se cobra por unidad. */
  cobrado: number;
  /** Cuánto se rebajó por unidad, en porcentaje (hasta un decimal). */
  porcentaje: number;
  /** Lo que se dejó de cobrar en el renglón completo. */
  ahorro: number;
  tieneDescuento: boolean;
}

export interface ResumenDelDescuento {
  /** Lo que valía todo a precio real. */
  subtotalDeLista: number;
  /** Rebaja de los renglones + descuento general. */
  descuento: number;
  /** Del total: descuento sobre el subtotal de lista, hasta un decimal. */
  porcentaje: number;
  descuentoDeRenglones: number;
  descuentoGeneral: number;
  /** «Se te aplicó un descuento total de $9.000 (15 %)». Vacío sin descuento. */
  frase: string | null;
}

const entero = (n: number) => Math.round(Number(n) || 0);
const unDecimal = (n: number) => Math.round(n * 10) / 10;

export function descuentoDelRenglon(
  r: RenglonConDescuento,
): DescuentoDelRenglon {
  const unitario = entero(r.precioUnitario);
  const porcentajeDeLinea = Math.min(
    100,
    Math.max(0, Number(r.descuentoPorcentaje) || 0),
  );
  const cobrado = entero(unitario * (1 - porcentajeDeLinea / 100));
  // Si se vendió por **encima** de la lista no hay rebaja que mostrar: el
  // precio real pasa a ser el que se cobró.
  const lista = Math.max(entero(r.precioDeLista ?? unitario), unitario);
  const ahorroUnitario = Math.max(0, lista - cobrado);
  const cantidad = Math.max(0, Number(r.cantidad) || 0);
  return {
    lista,
    cobrado,
    porcentaje: lista > 0 ? unDecimal((ahorroUnitario / lista) * 100) : 0,
    ahorro: ahorroUnitario * cantidad,
    tieneDescuento: ahorroUnitario > 0,
  };
}

export function resumenDelDescuento(
  renglones: RenglonConDescuento[],
  /** `discount_amount` de la venta: la rebaja total, renglones incluidos. */
  descuentoGeneral: number | null | undefined,
): ResumenDelDescuento {
  let subtotalDeLista = 0;
  let descuentoDeRenglones = 0;
  for (const r of renglones) {
    const d = descuentoDelRenglon(r);
    subtotalDeLista += d.lista * Math.max(0, Number(r.cantidad) || 0);
    descuentoDeRenglones += d.ahorro;
  }
  // Lo que la venta rebajó en total; si lo explican los renglones, no hay
  // descuento general aparte.
  const rebajaTotal = Math.max(0, entero(descuentoGeneral ?? 0));
  const general = Math.max(0, rebajaTotal - descuentoDeRenglones);
  const descuento = descuentoDeRenglones + general;
  const porcentaje =
    subtotalDeLista > 0 ? unDecimal((descuento / subtotalDeLista) * 100) : 0;
  return {
    subtotalDeLista,
    descuento,
    porcentaje,
    descuentoDeRenglones,
    descuentoGeneral: general,
    frase:
      descuento > 0
        ? `Se te aplicó un descuento total de ${pesos(descuento)}${porcentaje > 0 ? ` (${textoDelPorcentaje(porcentaje)})` : ''}`
        : null,
  };
}

/** «15 %», «12,5 %»: como se lee en Colombia. */
export function textoDelPorcentaje(p: number): string {
  return `${unDecimal(p).toLocaleString('es-CO')} %`;
}

/** «Descuento 15 %» o solo «Descuento» cuando el porcentaje no dice nada. */
export function rotuloDelDescuento(resumen: ResumenDelDescuento): string {
  return resumen.porcentaje > 0
    ? `Descuento ${textoDelPorcentaje(resumen.porcentaje)}`
    : 'Descuento';
}

const pesos = (n: number) => `$${entero(n).toLocaleString('es-CO')}`;
