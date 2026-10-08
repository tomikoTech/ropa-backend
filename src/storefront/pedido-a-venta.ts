/**
 * De pedido a venta: lo que se acepta, con qué descuento.
 *
 * «Cuando el cliente hace el pedido, yo lo acepto, le pongo el 10, el 15 o el
 * 30, y la factura se hace automática». El cliente pide 40; la tienda decide
 * si le manda 40, 30 o ninguna: «no a todos les vendemos la misma cantidad».
 *
 * Esto arma los renglones de la venta a partir del pedido y de lo que la
 * tienda aceptó, y rechaza lo que no cuadra antes de tocar inventario.
 *
 * Y lo que el cliente pide después de pedir, también cabe: «ya hizo el
 * pedido y me está pidiendo que le agregue 6 de Good Girl Blush»; «le estoy
 * poniendo 20 %, pero a Yum Yum le dieron precio de 50.000: ¿cómo edito el
 * precio solo de ese perfume para que no tome el 20?» (Andrea, 6 oct 2026).
 * De ahí los agregados, el precio a mano por renglón y el «sin descuento».
 */

export interface RenglonDelPedido {
  itemId: string;
  variantId: string;
  nombre: string;
  cantidadPedida: number;
  precioUnitario: number;
}

/** Un renglón que no venía en el pedido y la tienda agrega al aceptar. */
export interface Agregado {
  variantId: string;
  nombre: string;
  cantidad: number;
  /** Precio de lista de la variante, por si no se da uno a mano. */
  precioDeLista: number;
  precioUnitario?: number | null;
  sinDescuento?: boolean;
}

export interface Aceptacion {
  /** Cantidad aceptada por renglón; lo que no esté, va completo. */
  cantidades?: Record<string, number>;
  /** Precio unitario a mano por renglón (id del renglón → precio). */
  precios?: Record<string, number>;
  /** Renglones que van sin el descuento general. */
  sinDescuento?: string[];
  /** Lo que se le agrega al pedido (ya con nombre y precio de lista). */
  agregados?: Agregado[];
  /** Descuento para toda la venta, en porcentaje. */
  descuentoPorcentaje?: number | null;
}

export interface RenglonDeVenta {
  variantId: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  /** El precio se puso a mano: es el acordado, no una rebaja sobre la lista. */
  precioPactado?: boolean;
}

export interface VentaArmada {
  renglones: RenglonDeVenta[];
  /** Lo que el cliente pidió y no se le manda, para decírselo. */
  recortes: { nombre: string; pedida: number; aceptada: number }[];
  /** Lo que se le agregó sin que lo pidiera por el catálogo. */
  agregados: { nombre: string; cantidad: number }[];
  /** Renglones a precio cerrado, fuera del descuento general. */
  aPrecioFijo: { nombre: string; precio: number }[];
  descuentoPorcentaje: number;
  error?: string;
}

/** El precio de un renglón: el de la mano si lo hay, si no el de lista. */
function precioDelRenglon(
  nombre: string,
  deLista: number,
  aMano: number | null | undefined,
): { precio: number } | { error: string } {
  if (aMano === undefined || aMano === null) return { precio: deLista };
  const p = Math.round(Number(aMano));
  if (!Number.isFinite(p) || p < 0)
    return { error: `«${nombre}»: el precio no puede ser negativo.` };
  if (p === 0) return { error: `«${nombre}»: el precio no puede ser cero.` };
  return { precio: p };
}

export function armarVentaDelPedido(
  pedido: RenglonDelPedido[],
  a: Aceptacion,
): VentaArmada {
  const descuento = Math.round(Number(a.descuentoPorcentaje) || 0);
  const vacio: VentaArmada = {
    renglones: [],
    recortes: [],
    agregados: [],
    aPrecioFijo: [],
    descuentoPorcentaje: descuento,
  };
  if (descuento < 0 || descuento > 100)
    return { ...vacio, error: 'El descuento va de 0 a 100.' };
  const renglones: RenglonDeVenta[] = [];
  const recortes: VentaArmada['recortes'] = [];
  const agregados: VentaArmada['agregados'] = [];
  const aPrecioFijo: VentaArmada['aPrecioFijo'] = [];
  const sinDescuento = new Set(a.sinDescuento ?? []);
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
    // Más de lo pedido también vale: «quiero agregar 10 dúo postre y no me
    // deja más de 1» (Andrea). El cliente lo ve en el WhatsApp como cambio;
    // el stock lo frena la venta.
    if (aceptada !== pedida)
      recortes.push({ nombre: r.nombre, pedida, aceptada });
    if (aceptada === 0) continue;
    const precio = precioDelRenglon(
      r.nombre,
      r.precioUnitario,
      a.precios?.[r.itemId],
    );
    if ('error' in precio) return { ...vacio, error: precio.error };
    const fijo = sinDescuento.has(r.itemId);
    if (fijo && descuento > 0)
      aPrecioFijo.push({ nombre: r.nombre, precio: precio.precio });
    renglones.push({
      variantId: r.variantId,
      quantity: aceptada,
      unitPrice: precio.precio,
      discountPercent: fijo ? 0 : descuento,
      ...(a.precios?.[r.itemId] != null ? { precioPactado: true } : {}),
    });
  }
  // Lo agregado no se compara con lo pedido (es extra); el inventario lo
  // frena la venta si no alcanza.
  for (const g of a.agregados ?? []) {
    const cantidad = Math.round(Number(g.cantidad) || 0);
    if (cantidad <= 0)
      return {
        ...vacio,
        error: `«${g.nombre}»: para agregarlo la cantidad tiene que ser mayor que cero.`,
      };
    const precio = precioDelRenglon(
      g.nombre,
      g.precioDeLista,
      g.precioUnitario,
    );
    if ('error' in precio) return { ...vacio, error: precio.error };
    if (g.sinDescuento && descuento > 0)
      aPrecioFijo.push({ nombre: g.nombre, precio: precio.precio });
    agregados.push({ nombre: g.nombre, cantidad });
    renglones.push({
      variantId: g.variantId,
      quantity: cantidad,
      unitPrice: precio.precio,
      discountPercent: g.sinDescuento ? 0 : descuento,
      ...(g.precioUnitario != null ? { precioPactado: true } : {}),
    });
  }
  if (!renglones.length)
    return {
      ...vacio,
      recortes,
      error: 'No queda nada por mandar: si no se le vende, rechaza el pedido.',
    };
  return {
    renglones,
    recortes,
    agregados,
    aPrecioFijo,
    descuentoPorcentaje: descuento,
  };
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
  agregados?: VentaArmada['agregados'];
  aPrecioFijo?: VentaArmada['aPrecioFijo'];
  enlaceFactura?: string | null;
}): string {
  const plata = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
  const lineas = [
    `Hola ${p.cliente}, soy ${p.tienda}. Tu pedido ${p.numeroPedido} quedó confirmado.`,
    `Factura ${p.numeroFactura}: ${plata(p.total)}${p.descuentoPorcentaje > 0 ? ` (con ${p.descuentoPorcentaje} % de descuento)` : ''}.`,
  ];
  const menos = p.recortes.filter((r) => r.aceptada < r.pedida);
  const mas = p.recortes.filter((r) => r.aceptada > r.pedida);
  if (menos.length) {
    lineas.push('', 'Ojo, de esto no pudimos mandarte todo:');
    for (const r of menos)
      lineas.push(`- ${r.nombre}: pediste ${r.pedida}, van ${r.aceptada}`);
  }
  if (mas.length) {
    lineas.push('', 'Y de esto va más de lo que pediste:');
    for (const r of mas)
      lineas.push(`- ${r.nombre}: pediste ${r.pedida}, van ${r.aceptada}`);
  }
  if (p.agregados?.length) {
    lineas.push(
      '',
      `Te agregamos: ${p.agregados.map((g) => `${g.nombre} × ${g.cantidad}`).join(', ')}.`,
    );
  }
  if (p.aPrecioFijo?.length && p.descuentoPorcentaje > 0) {
    for (const f of p.aPrecioFijo)
      lineas.push(
        `${f.nombre} queda en ${plata(f.precio)} (sin el ${p.descuentoPorcentaje} %).`,
      );
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

/**
 * Cuándo vence el crédito si nadie puso fecha: los días que la tienda
 * configuró, o 30. «Que en la fecha que sea automático, como en la
 * facturación» (Andrea): el POS la propone sola y el pedido no la proponía.
 * Devuelve el día de calendario (YYYY-MM-DD), sin horas.
 */
export function vencimientoPorDefecto(
  diasConfigurados: number | null | undefined,
  hoy: Date = new Date(),
): string {
  const dias = Number(diasConfigurados);
  const plazo = Number.isFinite(dias) && dias > 0 ? Math.round(dias) : 30;
  const f = new Date(hoy.getTime() + plazo * 24 * 60 * 60 * 1000);
  // Día en Colombia: el servidor corre en UTC y a las 7 pm ya es «mañana».
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(f);
  return partes;
}
