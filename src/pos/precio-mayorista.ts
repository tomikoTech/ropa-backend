/**
 * Cuándo una venta se cobra al por mayor.
 *
 * Hasta hoy el mayoreo se disparaba **solo al vender una caja cerrada**. Si esa
 * misma caja se abría y se vendían los doce pares sueltos al mismo cliente,
 * había que acordarse de activar el modo mayorista a mano, venta por venta.
 *
 * La regla la pone cada tienda: `store_settings.mayorista_desde` dice desde
 * cuántas unidades de la **misma referencia** se cobra al por mayor. En cero
 * —el valor de nacimiento— nada cambia: sigue mandando la caja, que es como
 * funcionaba antes.
 *
 * **Por referencia, no por venta.** Doce pares del mismo modelo es un mayorista
 * llevándose una caja; doce pares de doce modelos distintos es un cliente
 * surtiéndose. Contar la venta entera le daría precio de mayoreo al segundo.
 *
 * Las tallas y los colores **suman**: para la bodega una caja son doce pares
 * de un modelo, repartidos en tallas. Contar por variante haría que una caja
 * completa no llegara nunca al umbral.
 *
 * El precio no lo decide esto solo: si el producto no tiene precio mayorista,
 * no hay a qué bajar y se cobra normal.
 */

export interface RenglonParaMayoreo {
  /** La referencia. Lo que agrupa: mismo modelo, cualquier talla o color. */
  productId: string;
  cantidad: number;
  /** Precio al por mayor del producto. Cero o nulo: no tiene. */
  precioMayorista?: number | null;
  /** Ya viene cobrado al por mayor por ser una caja cerrada. */
  esCaja?: boolean;
}

export interface MayoreoDelRenglon {
  productId: string;
  aplica: boolean;
  /** Cuántas unidades de esa referencia hay en toda la venta. */
  unidadesDeLaReferencia: number;
}

/**
 * @param desde umbral de la tienda. Cero, negativo o nulo: apagado.
 */
export function mayoreoPorReferencia(
  renglones: RenglonParaMayoreo[],
  desde: number | null | undefined,
): Map<string, MayoreoDelRenglon> {
  const unidades = new Map<string, number>();
  for (const renglon of renglones) {
    if (!renglon.productId) continue;
    const cantidad = Math.max(0, Math.trunc(renglon.cantidad));
    unidades.set(
      renglon.productId,
      (unidades.get(renglon.productId) ?? 0) + cantidad,
    );
  }

  const umbral = Math.trunc(desde ?? 0);
  const encendido = umbral > 0;
  const conPrecio = new Set(
    renglones
      .filter((renglon) => Number(renglon.precioMayorista ?? 0) > 0)
      .map((renglon) => renglon.productId),
  );

  const salida = new Map<string, MayoreoDelRenglon>();
  for (const [productId, total] of unidades) {
    salida.set(productId, {
      productId,
      aplica: encendido && conPrecio.has(productId) && total >= umbral,
      unidadesDeLaReferencia: total,
    });
  }
  return salida;
}

/**
 * El precio unitario de un renglón, ya con el mayoreo aplicado si toca.
 *
 * Una caja cerrada ya venía cobrada al por mayor por otro camino; acá no se
 * vuelve a tocar para no cambiar lo que hoy funciona.
 */
export function precioDelRenglon(
  renglon: RenglonParaMayoreo,
  precioActual: number,
  mayoreo: Map<string, MayoreoDelRenglon>,
): number {
  if (renglon.esCaja) return precioActual;
  const decision = mayoreo.get(renglon.productId);
  if (!decision?.aplica) return precioActual;
  const mayorista = Number(renglon.precioMayorista ?? 0);
  // Nunca sube el precio: el mayoreo es un descuento por volumen. Un producto
  // con el mayorista mal cargado —por encima del de lista— no puede terminar
  // cobrándole de más al cliente que más compra.
  return mayorista > 0 && mayorista < precioActual ? mayorista : precioActual;
}
