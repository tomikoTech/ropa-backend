/**
 * De pedido a venta: lo que se acepta, con qué descuento.
 *
 * «Cuando el cliente hace el pedido, yo lo acepto, le pongo el 10, el 15 o el
 * 30, y la factura se hace automática». El cliente pide 40; la tienda decide
 * si le manda 40, 30 o ninguna: «no a todos les vendemos la misma cantidad».
 *
 * Esto arma los renglones de la venta a partir del pedido y de lo que la
 * tienda aceptó, y rechaza lo que no cuadra antes de tocar inventario.
 */

export interface RenglonDelPedido {
  itemId: string;
  variantId: string;
  nombre: string;
  cantidadPedida: number;
  precioUnitario: number;
}

export interface Aceptacion {
  /** Cantidad aceptada por renglón; lo que no esté, va completo. */
  cantidades?: Record<string, number>;
  /** Descuento para toda la venta, en porcentaje. */
  descuentoPorcentaje?: number | null;
}

export interface RenglonDeVenta {
  variantId: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

export interface VentaArmada {
  renglones: RenglonDeVenta[];
  /** Lo que el cliente pidió y no se le manda, para decírselo. */
  recortes: { nombre: string; pedida: number; aceptada: number }[];
  descuentoPorcentaje: number;
  error?: string;
}

export function armarVentaDelPedido(
  pedido: RenglonDelPedido[],
  a: Aceptacion,
): VentaArmada {
  const descuento = Math.round(Number(a.descuentoPorcentaje) || 0);
  const vacio: VentaArmada = {
    renglones: [],
    recortes: [],
    descuentoPorcentaje: descuento,
  };
  if (descuento < 0 || descuento > 100)
    return { ...vacio, error: 'El descuento va de 0 a 100.' };
  const renglones: RenglonDeVenta[] = [];
  const recortes: VentaArmada['recortes'] = [];
  for (const r of pedido) {
    const pedida = Math.max(0, Math.round(r.cantidadPedida));
    const aceptada =
      a.cantidades && r.itemId in a.cantidades
        ? Math.round(Number(a.cantidades[r.itemId]) || 0)
        : pedida;
    if (aceptada < 0)
      return {
        ...vacio,
        error: `«${r.nombre}»: la cantidad no puede ser negativa.`,
      };
    if (aceptada > pedida)
      return {
        ...vacio,
        error: `«${r.nombre}»: pidió ${pedida} y se le quieren mandar ${aceptada}.`,
      };
    if (aceptada < pedida)
      recortes.push({ nombre: r.nombre, pedida, aceptada });
    if (aceptada === 0) continue;
    renglones.push({
      variantId: r.variantId,
      quantity: aceptada,
      unitPrice: r.precioUnitario,
      discountPercent: descuento,
    });
  }
  if (!renglones.length)
    return {
      ...vacio,
      recortes,
      error: 'No queda nada por mandar: si no se le vende, rechaza el pedido.',
    };
  return { renglones, recortes, descuentoPorcentaje: descuento };
}

/** El WhatsApp al cliente cuando se acepta. */
export function mensajeDeAceptacion(p: {
  tienda: string;
  cliente: string;
  numeroPedido: string;
  numeroFactura: string;
  total: number;
  descuentoPorcentaje: number;
  recortes: VentaArmada['recortes'];
  enlaceFactura?: string | null;
}): string {
  const plata = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
  const lineas = [
    `Hola ${p.cliente}, soy ${p.tienda}. Tu pedido ${p.numeroPedido} quedó confirmado.`,
    `Factura ${p.numeroFactura}: ${plata(p.total)}${p.descuentoPorcentaje > 0 ? ` (con ${p.descuentoPorcentaje} % de descuento)` : ''}.`,
  ];
  if (p.recortes.length) {
    lineas.push('', 'Ojo, de esto no pudimos mandarte todo:');
    for (const r of p.recortes)
      lineas.push(`- ${r.nombre}: pediste ${r.pedida}, van ${r.aceptada}`);
  }
  if (p.enlaceFactura) lineas.push('', `Tu factura: ${p.enlaceFactura}`);
  return lineas.join('\n');
}

/** El WhatsApp al cliente cuando se rechaza. */
export function mensajeDeRechazo(p: {
  tienda: string;
  cliente: string;
  numeroPedido: string;
  motivo?: string | null;
}): string {
  return [
    `Hola ${p.cliente}, soy ${p.tienda}. No pudimos confirmar tu pedido ${p.numeroPedido}.`,
    p.motivo?.trim() ? `Motivo: ${p.motivo.trim()}` : null,
    'Escríbenos y lo cuadramos.',
  ]
    .filter(Boolean)
    .join('\n');
}
