/**
 * Un precio al por mayor por debajo del costo no es un descuento: es un error
 * de carga.
 *
 * De dónde sale esta regla: en AMAWAD los 22 productos tenían el **costo**
 * escrito en «precio mayorista». Y se entiende: para quien importa, «el precio
 * del mayorista» es lo que *le cobran a él*. Pero acá el campo es lo que **la
 * tienda cobra** cuando vende una caja completa —y como la caja se cobra
 * siempre al por mayor, el POS proponía el costo en cada venta—.
 *
 * Solo se rechaza cuando lo están **cambiando**: un producto viejo con el dato
 * malo tiene que poder editarse por cualquier otra razón (el nombre, la foto)
 * sin quedar trancado.
 *
 * Puro: entra el precio nuevo, el viejo y el costo; sale el problema o nada.
 */
export function problemaDelPrecioMayorista(entrada: {
  /** Lo que se quiere guardar. `undefined` = no se está tocando. */
  nuevo?: number | null;
  /** Lo que ya estaba guardado. */
  anterior?: number | null;
  /** Costo del producto. Cero o ausente = no se registró, no hay con qué comparar. */
  costo?: number | null;
}): string | null {
  const { nuevo, anterior, costo } = entrada;
  if (nuevo === undefined) return null;
  const valor = Number(nuevo ?? 0);
  if (!(valor > 0)) return null;
  const cost = Number(costo ?? 0);
  if (!(cost > 0)) return null;
  // No se está cambiando: es un dato viejo y no puede trancar otras ediciones.
  if (Number(anterior ?? 0) === valor) return null;
  if (valor > cost) return null;
  return (
    `El precio al por mayor (${valor}) no puede ser menor o igual al costo (${cost}): ` +
    'es lo que TÚ cobras al vender una caja completa, no lo que te cuesta. ' +
    'Cada caja se vendería a pérdida.'
  );
}
