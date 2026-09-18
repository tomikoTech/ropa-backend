/**
 * Los huecos de la vitrina y qué hacer con cada uno.
 *
 * La vitrina es una plantilla: lo que se exhibió una vez tiene su puesto.
 * Se vende la muestra y la referencia no sale del aparador —queda el hueco—.
 * Para cada hueco la pregunta es una sola: ¿con qué se repone?
 *
 * - Si el local que surte la vitrina tiene pares, se **repone** de ahí.
 * - Si no los tiene pero otra bodega sí, se **solicita** (solicitud interna
 *   al local, y de ahí sube).
 * - Si no hay en ninguna parte, no hay nada que hacer salvo saberlo.
 *
 * Puro: decide con los números; el servicio los trae.
 */

export interface ExistenciaEnBodega {
  bodegaId: string;
  bodega: string;
  cantidad: number;
}

export interface FilaDeLaPlantilla {
  vitrinaId: string;
  vitrinaNombre: string;
  localId: string;
  localNombre: string;
  productId: string;
  productNombre: string;
  referencia: string | null;
  imageUrl: string | null;
  /** Pares de la referencia hoy en la vitrina. */
  enVitrina: number;
  /** Pares en el local que surte la vitrina. */
  enLocal: number;
  /** En las demás bodegas (sin la vitrina ni el local). */
  enOtras: ExistenciaEnBodega[];
  /** Cuántas muestras de esta referencia se han vendido desde la vitrina. */
  vendidasDeLaVitrina: number;
  /** La última muestra vendida: la talla que conviene reponer. */
  ultimaMuestra: {
    variantId: string;
    talla: string;
    codigo: string | null;
  } | null;
  /** Los bultos que están hoy en la vitrina, con su código: cuál es, exactamente. */
  bultosEnVitrina: { codigo: string; talla: string; esCaja: boolean; pares: number }[];
}

export type AccionDelHueco = 'reponer' | 'solicitar' | 'sin-existencia';

export interface HuecoDeVitrina extends FilaDeLaPlantilla {
  accion: AccionDelHueco;
  /** De dónde se puede pedir, la que más tenga primero. */
  pedirA: ExistenciaEnBodega | null;
}

export function accionDelHueco(
  f: Pick<FilaDeLaPlantilla, 'enLocal' | 'enOtras'>,
): AccionDelHueco {
  if (f.enLocal > 0) return 'reponer';
  if (f.enOtras.some((b) => b.cantidad > 0)) return 'solicitar';
  return 'sin-existencia';
}

/** Solo los puestos vacíos, con qué hacer en cada uno. Los llenos no molestan. */
export function huecosDeLaPlantilla(
  filas: FilaDeLaPlantilla[],
): HuecoDeVitrina[] {
  return filas
    .filter((f) => f.enVitrina <= 0)
    .map((f) => {
      const otras = [...f.enOtras]
        .filter((b) => b.cantidad > 0)
        .sort(
          (a, b) =>
            b.cantidad - a.cantidad || a.bodega.localeCompare(b.bodega, 'es'),
        );
      return {
        ...f,
        enOtras: otras,
        accion: accionDelHueco(f),
        pedirA: otras[0] ?? null,
      };
    })
    .sort((a, b) => {
      // Primero lo que se resuelve ya (reponer), luego lo que hay que pedir,
      // y de último lo que no tiene arreglo; dentro de cada grupo, lo que
      // más se ha vendido —es lo que más falta hace en el aparador—.
      const orden: Record<AccionDelHueco, number> = {
        reponer: 0,
        solicitar: 1,
        'sin-existencia': 2,
      };
      return (
        orden[a.accion] - orden[b.accion] ||
        b.vendidasDeLaVitrina - a.vendidasDeLaVitrina ||
        a.productNombre.localeCompare(b.productNombre, 'es')
      );
    });
}
