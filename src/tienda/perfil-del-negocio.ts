/**
 * Qué clase de negocio es la tienda, y qué se deriva de eso.
 *
 * MiPinta nació para calzado y habla en pares, tallas y cajas. Distri Amber
 * vende lociones: «ojo con la palabra PARES, la tienda no es de ropa; no hay
 * variantes ni tallas tampoco». Hasta ahora cada pantalla lo resolvía a su
 * manera —el PDF miraba el inventario por cajas, el POS un filtro que nadie
 * tocaba— y siempre quedaba un «pares» asomado en alguna parte.
 *
 * Acá vive la regla, una sola vez y sin base de datos. La tienda dice qué es
 * (`store_settings.tipo_de_negocio`) y de ahí sale el vocabulario, qué
 * pantallas sobran y qué se enseña por defecto. El espejo en el navegador es
 * `ropa-frontend/src/lib/perfil-del-negocio.ts`: si los dos no dicen lo
 * mismo, el papel y la pantalla se contradicen.
 *
 * `calzado` es el valor de nacimiento: ninguna tienda que ya existía cambia.
 */

export const TIPOS_DE_NEGOCIO = ['calzado', 'perfumeria', 'general'] as const;
export type TipoDeNegocio = (typeof TIPOS_DE_NEGOCIO)[number];

export const NOMBRE_DEL_TIPO: Record<TipoDeNegocio, string> = {
  calzado: 'Calzado',
  perfumeria: 'Perfumería',
  general: 'Otro comercio',
};

export interface PerfilDelNegocio {
  tipo: TipoDeNegocio;
  /** Lo que se cuenta en la factura: «Total pares» o «Total productos». */
  rotuloDeUnidades: 'pares' | 'unidades';
  /** Singular de lo anterior: «1 par», «1 unidad». */
  unidad: 'par' | 'unidad';
  /** Si los productos se abren en tallas y colores. */
  tieneTallas: boolean;
  /** Si hay cajas, curvas, etiquetas por par y consulta por código. */
  tieneCajas: boolean;
  /**
   * Si al vender y al mirar existencias solo se enseña el **producto
   * terminado**, dejando esencias y frascos para sus propias pestañas.
   */
  soloTerminadosEnVenta: boolean;
  /** El pedido del catálogo es siempre a domicilio. */
  pedidoSiempreADomicilio: boolean;
  /**
   * El frasco se descuenta al **producir**, no al vender. La botella se usa
   * cuando César llena la loción; descontarla otra vez en la venta era
   * contar el mismo frasco dos veces (así quedó ASAD BOURBON en −17).
   */
  frascoSeDescuentaAlProducir: boolean;
}

/** Lo que se lee de `store_settings` para armar el perfil. */
export interface AjustesParaElPerfil {
  tipoDeNegocio?: string | null;
  unitTrackingEnabled?: boolean | null;
  /**
   * Las tiendas de antes no tienen `tipoDeNegocio`: la que tenía Producción
   * encendida era la perfumería. Sirve de pista cuando el tipo falta.
   */
  productionEnabled?: boolean | null;
}

export function esTipoDeNegocio(valor: unknown): valor is TipoDeNegocio {
  return (
    typeof valor === 'string' &&
    (TIPOS_DE_NEGOCIO as readonly string[]).includes(valor)
  );
}

/**
 * Deduce el tipo cuando la fila no lo trae.
 *
 * Es lo que hace la migración y lo que hace el código mientras la migración
 * no haya corrido: la perfumería era la única con Producción.
 */
export function tipoDeNegocioDe(
  s: AjustesParaElPerfil | null | undefined,
): TipoDeNegocio {
  if (esTipoDeNegocio(s?.tipoDeNegocio)) return s.tipoDeNegocio;
  return s?.productionEnabled ? 'perfumeria' : 'calzado';
}

export function perfilDelNegocio(
  s: AjustesParaElPerfil | null | undefined,
): PerfilDelNegocio {
  const tipo = tipoDeNegocioDe(s);
  switch (tipo) {
    case 'perfumeria':
      return {
        tipo,
        rotuloDeUnidades: 'unidades',
        unidad: 'unidad',
        tieneTallas: false,
        // Aunque la tienda tuviera el interruptor prendido: una loción no se
        // etiqueta par por par. Es lo que fuerza también el servidor al guardar.
        tieneCajas: false,
        soloTerminadosEnVenta: true,
        pedidoSiempreADomicilio: true,
        frascoSeDescuentaAlProducir: true,
      };
    case 'general':
      return {
        tipo,
        rotuloDeUnidades: 'unidades',
        unidad: 'unidad',
        tieneTallas: true,
        tieneCajas: !!s?.unitTrackingEnabled,
        soloTerminadosEnVenta: false,
        pedidoSiempreADomicilio: false,
        frascoSeDescuentaAlProducir: false,
      };
    default:
      return {
        tipo: 'calzado',
        // Quien lleva cajas y pares uno por uno cuenta **pares**; sin bultos
        // cuenta unidades. Es lo que hacía el PDF antes de existir el perfil.
        rotuloDeUnidades: s?.unitTrackingEnabled ? 'pares' : 'unidades',
        unidad: s?.unitTrackingEnabled ? 'par' : 'unidad',
        tieneTallas: true,
        tieneCajas: !!s?.unitTrackingEnabled,
        soloTerminadosEnVenta: false,
        pedidoSiempreADomicilio: false,
        frascoSeDescuentaAlProducir: false,
      };
  }
}

/** «3 pares», «1 unidad»: la cantidad con su palabra. */
export function contarUnidades(perfil: PerfilDelNegocio, n: number): string {
  return `${n} ${n === 1 ? perfil.unidad : perfil.rotuloDeUnidades}`;
}

/**
 * El tipo de producto que se busca cuando nadie pidió uno.
 *
 * En una perfumería, al vender, solo el producto terminado: «para qué quiero
 * ver el frasco y la esencia si solo facturo producto terminado». Un tipo
 * pedido a propósito (las pestañas de Frascos y Esencias) manda siempre.
 */
export function tipoDeProductoPorDefecto(
  perfil: PerfilDelNegocio,
  pedido?: string | null,
): string | undefined {
  // `TODOS` lo manda el buscador compartido (compras, ajustes, traslados):
  // ahí sí hace falta ver esencias y frascos, que es lo que se compra.
  if (pedido === 'TODOS') return undefined;
  if (pedido) return pedido;
  return perfil.soloTerminadosEnVenta ? 'STANDARD' : undefined;
}
