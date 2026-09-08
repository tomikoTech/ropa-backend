/**
 * A qué línea de la factura le toca cada código.
 *
 * Una venta guarda sus movimientos con los códigos que sacó, pero no con qué
 * renglón se llevó cuál. Para mostrar el detalle —y sobre todo para poder
 * **editar** la factura señalando bultos concretos— hay que repartirlos.
 *
 * El reparto se hacía por número de códigos: a una línea de 24 pares le
 * entregaban hasta 24 **códigos**. Pero un código de caja no es un par: es una
 * caja de 24. Así, la primera línea se llevaba las cuatro cajas de la venta y
 * las otras tres quedaban sin ninguna. Al guardar, el servidor intentaba
 * descontar cuatro cajas —96 pares— para una línea de 24, los bultos se
 * agotaban en el primer renglón y el resto moría con «el código … ya no está
 * disponible». Daba igual qué etiqueta se escaneara: la factura llegaba mal
 * repartida desde antes.
 *
 * Se reparte por **unidades**, y una caja no se parte entre dos renglones.
 */

/** Un código con lo que trae adentro. */
export interface CodigoDisponible {
  barcode: string;
  /** Cuántas unidades arrastra. Una caja de 24 vale por 24. */
  unidades: number;
}

/**
 * Toma del frente los códigos que cubren `cantidad` unidades.
 *
 * **Muta `disponibles`**: lo que se lleva esta línea deja de estar para la
 * siguiente. Es lo que hace que repartir varias líneas seguidas funcione.
 *
 * Una caja que no cabe entera se salta y queda para otro renglón: partirla
 * significaría que media caja se vendió en una línea y media en otra, y el
 * código impreso es uno solo.
 */
export function tomarParaLaLinea(
  disponibles: CodigoDisponible[],
  cantidad: number,
): string[] {
  const tomados: string[] = [];
  let faltan = Math.max(0, cantidad);

  for (let i = 0; i < disponibles.length && faltan > 0; ) {
    const codigo = disponibles[i];
    const trae = Math.max(1, Math.trunc(codigo.unidades));
    if (trae > faltan) {
      // No cabe entera: se queda donde está y seguimos con la siguiente.
      i++;
      continue;
    }
    tomados.push(codigo.barcode);
    disponibles.splice(i, 1);
    faltan -= trae;
  }

  return tomados;
}
