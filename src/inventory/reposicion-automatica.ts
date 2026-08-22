/**
 * Cuándo el sistema pide reposición sin que nadie se lo diga.
 *
 * Nace de la queja más fuerte que dejó una tienda sobre su sistema anterior:
 * «siempre hay que notificar, reponer ese, reponer ese… solo debería ser
 * automático». La reposición ya existía, pero exigía configurar un mínimo por
 * variante y en la práctica nadie lo configuraba, así que nunca avisaba.
 *
 * La regla es corta; toda la gracia está en los bordes: no pedir dos veces lo
 * mismo, no pedir lo que ya viene en camino, y no pedirle a una bodega que
 * tampoco tiene —una solicitud que nadie puede cumplir la lee el bodeguero
 * como un error suyo—.
 *
 * Vive aparte del servicio para poder probar esos bordes sin montar una venta.
 */

export interface ConfiguracionReposicion {
  /** Apagada por defecto: no todas las tiendas trabajan con bodega aparte. */
  encendida: boolean;
  /** Cuando el local baja a esto o menos, se pide. */
  umbral: number;
  /** Hasta cuánto se repone. */
  objetivo: number;
  /**
   * Los productos que se reponen solos.
   *
   * `null` = todos. Una lista vacía **no** es lo mismo: es una decisión de la
   * tienda de no reponer nada automáticamente todavía.
   */
  soloEstosProductos: string[] | null;
}

export interface EstadoDelPunto {
  productId: string;
  /** Lo que queda en el local. */
  saldo: number;
  /** Lo que ya viene en camino o está pedido y sin despachar. */
  yaPedido: number;
  /** Lo que la bodega de origen puede mandar. */
  disponibleEnOrigen: number;
  /** El mínimo propio de esta referencia, si la tienda se lo puso. */
  umbralPropio: number | null;
}

export function decidirReposicion(
  config: ConfiguracionReposicion,
  punto: EstadoDelPunto,
): { cantidad: number } | null {
  if (!config.encendida) return null;
  if (
    config.soloEstosProductos !== null &&
    !config.soloEstosProductos.includes(punto.productId)
  ) {
    return null;
  }

  // El mínimo de la referencia manda sobre el general: una que rota muchísimo
  // puede querer un umbral más alto.
  const umbral = punto.umbralPropio ?? config.umbral;
  // Un saldo negativo es existencia mal cuadrada de antes, no una deuda: se
  // trata como cero para no reponer de más por un error viejo.
  const saldo = Math.max(0, punto.saldo);
  if (saldo > umbral) return null;

  // Si el umbral quedara por encima del objetivo, reponer hasta el objetivo
  // dejaría el local todavía por debajo del umbral y pediría otra vez en la
  // venta siguiente: un bucle. El objetivo sube con él.
  const objetivo = Math.max(config.objetivo, umbral);
  const falta = objetivo - saldo - Math.max(0, punto.yaPedido);
  if (falta <= 0) return null;

  const cantidad = Math.min(falta, Math.max(0, punto.disponibleEnOrigen));
  return cantidad > 0 ? { cantidad } : null;
}
