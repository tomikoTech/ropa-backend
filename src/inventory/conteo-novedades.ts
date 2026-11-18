/**
 * Qué pasó con cada código en un conteo físico, en una sola cuenta.
 *
 * El resumen (las tarjetas de la pantalla), el detalle que se abre al tocarlas,
 * el CSV y la validación del cierre salen todos de aquí, para que nunca digan
 * números distintos.
 *
 * Tres reglas que antes se mezclaban:
 *
 * - **Novedad es un código, no una lectura.** Pasar tres veces la pistola por
 *   un código desconocido es una novedad, no tres.
 * - **Leer dos veces lo ya contado no es novedad.** La pistola repite; el
 *   segundo disparo no suma ni resta nada. Se cuenta aparte, para que se vea,
 *   pero no infla las novedades (en AMAWAD eran 29 de las 42).
 * - **Lo que salió mientras se contaba no es faltante.** Con el conteo
 *   abierto, si un código de la foto ya no está disponible en la bodega (se
 *   vendió o se trasladó), no se puede pedir encontrarlo. El cierre tampoco lo
 *   da de baja. Solo aplica en vivo: en un conteo cerrado, lo que pasó después
 *   no cambia lo que faltó ese día.
 *
 * Una novedad que después se resolvió (no estaba disponible, se corrigió y se
 * volvió a leer como contado) deja de serlo.
 *
 * Puro, sin base de datos: ver `conteo-novedades.spec.ts`.
 */

export type ResultadoDeLectura =
  | 'COUNTED'
  | 'SURPLUS'
  | 'DUPLICATE'
  | 'UNKNOWN'
  | 'WRONG_WAREHOUSE'
  | 'NOT_AVAILABLE';

export type TipoDeNovedad = 'UNKNOWN' | 'WRONG_WAREHOUSE' | 'NOT_AVAILABLE';

export interface EsperadoMinimo {
  stockUnitId: string;
  barcode: string;
  quantity: number;
  stockUnit?: { status: string; warehouseId: string } | null;
}

export interface LecturaMinima {
  barcode: string;
  stockUnitId: string | null;
  // `string` y no `ResultadoDeLectura`: la entidad guarda el enum de TypeORM.
  result: string;
  createdAt: Date;
}

export interface CodigoConLecturas<L> {
  barcode: string;
  /** Cuántas veces se leyó con este resultado. */
  lecturas: number;
  /** La lectura más reciente: trae el mensaje y el bulto. */
  ultima: L;
}

export interface NovedadDeCodigo<L> extends CodigoConLecturas<L> {
  tipo: TipoDeNovedad;
}

export interface ConteoClasificado<E, L> {
  /** Códigos de la foto que sí aparecieron. */
  contados: L[];
  /** Aparecieron y no estaban en la foto de apertura. */
  sobrantes: L[];
  /** De la foto, siguen en la bodega según el sistema y nadie los leyó. */
  faltantes: E[];
  /** De la foto, salieron de la bodega mientras se contaba (solo en vivo). */
  salieron: E[];
  /** Un código por fila, con cuántas veces se leyó. */
  novedades: NovedadDeCodigo<L>[];
  /** Códigos ya contados que se volvieron a leer: no suman ni restan. */
  repetidos: CodigoConLecturas<L>[];
}

const EXITOSAS = new Set<string>(['COUNTED', 'SURPLUS']);
const NOVEDADES = new Set<string>([
  'UNKNOWN',
  'WRONG_WAREHOUSE',
  'NOT_AVAILABLE',
]);

/** El mismo bulto aunque se haya escrito distinto; sin bulto, el código. */
const claveDe = (l: LecturaMinima) =>
  l.stockUnitId ? `u:${l.stockUnitId}` : `c:${l.barcode.trim().toUpperCase()}`;

function agrupar<L extends LecturaMinima>(
  lecturas: L[],
): Map<string, CodigoConLecturas<L>> {
  const grupos = new Map<string, CodigoConLecturas<L>>();
  for (const l of lecturas) {
    const clave = claveDe(l);
    const previo = grupos.get(clave);
    if (!previo) {
      grupos.set(clave, { barcode: l.barcode, lecturas: 1, ultima: l });
      continue;
    }
    previo.lecturas += 1;
    if (l.createdAt.getTime() > previo.ultima.createdAt.getTime()) {
      previo.ultima = l;
      previo.barcode = l.barcode;
    }
  }
  return grupos;
}

const porMasReciente = <T extends { ultima: LecturaMinima }>(a: T, b: T) =>
  b.ultima.createdAt.getTime() - a.ultima.createdAt.getTime();

export function clasificarConteo<
  E extends EsperadoMinimo,
  L extends LecturaMinima,
>(
  esperados: E[],
  lecturas: L[],
  opciones: { bodegaId: string; enVivo: boolean },
): ConteoClasificado<E, L> {
  const exitosas = lecturas.filter((l) => EXITOSAS.has(l.result));
  const encontrados = new Set(
    exitosas.map((l) => l.stockUnitId).filter((id): id is string => !!id),
  );
  const codigosEncontrados = new Set(
    exitosas.map((l) => l.barcode.trim().toUpperCase()),
  );
  const enLaFoto = new Set(esperados.map((e) => e.stockUnitId));

  const contados = exitosas.filter(
    (l) => !!l.stockUnitId && enLaFoto.has(l.stockUnitId),
  );
  const sobrantes = exitosas.filter(
    (l) => !!l.stockUnitId && !enLaFoto.has(l.stockUnitId),
  );

  const noAparecieron = esperados.filter(
    (e) => !encontrados.has(e.stockUnitId),
  );
  const sigueEnLaBodega = (e: E) =>
    !opciones.enVivo ||
    !e.stockUnit ||
    (e.stockUnit.status === 'IN_STOCK' &&
      e.stockUnit.warehouseId === opciones.bodegaId);
  const faltantes = noAparecieron.filter(sigueEnLaBodega);
  const salieron = noAparecieron.filter((e) => !sigueEnLaBodega(e));

  const resuelta = (l: L) =>
    (!!l.stockUnitId && encontrados.has(l.stockUnitId)) ||
    codigosEncontrados.has(l.barcode.trim().toUpperCase());

  const novedades = [
    ...agrupar(
      lecturas.filter((l) => NOVEDADES.has(l.result) && !resuelta(l)),
    ).values(),
  ]
    .map((g) => ({ ...g, tipo: g.ultima.result as TipoDeNovedad }))
    .sort(porMasReciente);

  const repetidos = [
    ...agrupar(lecturas.filter((l) => l.result === 'DUPLICATE')).values(),
  ].sort(porMasReciente);

  return { contados, sobrantes, faltantes, salieron, novedades, repetidos };
}

/** Las unidades, por referencia: lo que dice el agregado, no los códigos. */
export function diferenciaDeUnidades(
  lineas: { expectedQuantity: number; countedQuantity: number }[],
) {
  let esperadas = 0;
  let contadas = 0;
  let faltan = 0;
  let sobran = 0;
  let referencias = 0;
  for (const l of lineas) {
    esperadas += l.expectedQuantity;
    contadas += l.countedQuantity;
    const d = l.countedQuantity - l.expectedQuantity;
    if (d < 0) faltan -= d;
    if (d > 0) sobran += d;
    if (d !== 0) referencias += 1;
  }
  return { esperadas, contadas, faltan, sobran, referencias };
}
