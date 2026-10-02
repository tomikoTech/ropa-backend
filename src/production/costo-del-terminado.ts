/**
 * Cuánto cuesta una loción terminada.
 *
 * El Excel de Jefferson, hecho regla: «el frasco me costó 30, la mano de obra
 * 7, la esencia 7: el costo del producto son 44.000. La venta está en 60
 * menos 15 %: le estoy ganando 7.000. Queremos esto, pero que lo dé el
 * sistema».
 *
 * Tres sumandos y nada más:
 *
 *  - **Frasco**: lo que costó el frasco de esa loción en su última compra.
 *  - **Esencia**: un valor fijo por unidad, decisión de ellos: «mucha o poca,
 *    7.000, lo cerramos ahí». Sacar el costo real por gramos exigía que cada
 *    loción tuviera su receta exacta, y eso fue lo que nunca se usó.
 *  - **Mano de obra**: un valor general de la tienda, que un producto puede
 *    cambiar porque «no siempre cobramos igual».
 *
 * El resultado se guarda en el producto al registrar la entrada de
 * terminados, y la venta lo congela en `sale_items.unit_cost`: de ahí sale la
 * ganancia en el balance sin que nadie haga cuentas a mano.
 *
 * Todo en pesos enteros.
 */

export interface InsumosDelCosto {
  /** Costo unitario del frasco; `null` si nunca se compró. */
  costoDelFrasco: number | null | undefined;
  /** `store_settings.costo_fijo_de_esencia`. */
  esenciaFijaPorUnidad: number | null | undefined;
  /** `store_settings.mano_de_obra_por_unidad`. */
  manoDeObraGeneral: number | null | undefined;
  /** `products.mano_de_obra`: manda sobre el general cuando está puesto. */
  manoDeObraDelProducto?: number | null;
}

export interface CostoDelTerminado {
  frasco: number;
  esencia: number;
  manoDeObra: number;
  total: number;
  /** Lo que faltó para que el costo sea de verdad: se enseña, no se esconde. */
  avisos: string[];
}

const entero = (n: number | null | undefined) =>
  Math.max(0, Math.round(Number(n) || 0));

export function costoDelTerminado(i: InsumosDelCosto): CostoDelTerminado {
  const avisos: string[] = [];
  const frasco = entero(i.costoDelFrasco);
  if (i.costoDelFrasco === null || i.costoDelFrasco === undefined) {
    avisos.push(
      'El frasco no tiene costo: no se ha comprado o la compra no trae costo.',
    );
  }
  const esencia = entero(i.esenciaFijaPorUnidad);
  if (!esencia)
    avisos.push(
      'La esencia por unidad está en cero: ponla en Configuración → Producción.',
    );
  const manoDeObra =
    i.manoDeObraDelProducto !== null && i.manoDeObraDelProducto !== undefined
      ? entero(i.manoDeObraDelProducto)
      : entero(i.manoDeObraGeneral);
  return {
    frasco,
    esencia,
    manoDeObra,
    total: frasco + esencia + manoDeObra,
    avisos,
  };
}

/** «Frasco $30.000 + esencia $7.000 + mano de obra $7.000 = $44.000». */
export function desgloseDelCosto(c: CostoDelTerminado): string {
  const p = (n: number) => `$${n.toLocaleString('es-CO')}`;
  return `Frasco ${p(c.frasco)} + esencia ${p(c.esencia)} + mano de obra ${p(c.manoDeObra)} = ${p(c.total)}`;
}

/**
 * Lo que de verdad se gana en una venta: precio cobrado menos costo.
 * Con el ejemplo de Jefferson: 60.000 − 15 % = 51.000; 51.000 − 44.000 = 7.000.
 */
export function gananciaPorUnidad(
  precioCobrado: number,
  costo: CostoDelTerminado,
): number {
  return Math.round(Number(precioCobrado) || 0) - costo.total;
}
