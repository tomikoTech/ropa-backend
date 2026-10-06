/**
 * Si lo que pide el cliente por el catálogo se puede mandar.
 *
 * Andrea, con el primer pedido del enlace (6 oct 2026): «Vulcan en el
 * inventario ya solo queda 1 y por qué les da la opción de 6. Estuche Yara
 * sale en 0 pesos». El catálogo dejaba pedir cualquier cantidad y un
 * producto sin precio entraba al pedido en $0. Acá se revisa renglón por
 * renglón contra la bodega de venta, y el cliente recibe el motivo exacto
 * («solo quedan 1») en vez de un pedido que después hay que recortar.
 *
 * Es para la perfumería: ahí el catálogo vende lo que hay en la bodega. Una
 * zapatería como the-culture publica por bandera «disponible» sin llevar
 * stock, y bloquearla dejaría el catálogo vacío.
 *
 * Puro: sin base de datos.
 */
export interface RenglonPedido {
  nombre: string;
  pedida: number;
  existencias: number;
  precio: number;
}

export interface VeredictoDelPedido {
  ok: boolean;
  errores: string[];
}

export function alcanzaParaElPedido(
  renglones: RenglonPedido[],
): VeredictoDelPedido {
  const errores: string[] = [];
  for (const r of renglones) {
    const pedida = Math.max(0, Math.round(Number(r.pedida) || 0));
    const hay = Math.max(0, Math.round(Number(r.existencias) || 0));
    const precio = Number(r.precio) || 0;
    if (precio <= 0) {
      errores.push(`${r.nombre}: no tiene precio todavía`);
      continue;
    }
    if (pedida <= 0) continue;
    if (hay === 0) errores.push(`${r.nombre}: se agotó`);
    else if (pedida > hay)
      errores.push(
        `${r.nombre}: pediste ${pedida} y solo ${hay === 1 ? 'queda' : 'quedan'} ${hay}`,
      );
  }
  return { ok: errores.length === 0, errores };
}

/** Un solo texto para el error HTTP, un renglón por problema. */
export function textoDelVeredicto(v: VeredictoDelPedido): string {
  return v.errores.join('\n');
}
