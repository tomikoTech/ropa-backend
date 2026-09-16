/**
 * La familia de un código: sus parientes.
 *
 * Con el sticker de un par en la mano —Air Force 1, talla 41— la pregunta
 * que sigue casi nunca es sobre ese par: es «¿hay 42?», «¿de qué caja salió
 * y dónde están sus hermanos?», «¿cuántas cajas de este modelo quedan y en
 * qué bodega?». La ficha contestaba solo por el código consultado y había
 * que ir a Existencias, filtrar, volver.
 *
 * Acá se arma esa respuesta con lo que el servicio trae: el modelo, todas
 * sus tallas con existencia por bodega y sus pares sueltos, la caja de la
 * que salió el código con sus hermanos y dónde está cada uno, y las demás
 * cajas del modelo. Puro; el servicio consulta.
 */

import { compararTallas } from '../storefront/catalogo.js';

export interface VarianteFuente {
  id: string;
  sizeName?: string | null;
  colorName?: string | null;
  barcode?: string | null;
  sku?: string | null;
  isActive?: boolean;
}

export interface StockFuente {
  variantId: string;
  warehouseId: string;
  quantity: number | string;
}

export interface BodegaFuente {
  id: string;
  name: string;
  /** Es una vitrina: lo que está ahí ya está exhibido. */
  esVitrina?: boolean;
}

export interface UnidadFuente {
  id: string;
  barcode: string;
  kind: 'BOX' | 'UNIT';
  status: string;
  variantId: string | null;
  sizeName?: string | null;
  warehouseId: string;
  quantity: number | string;
  parentUnitId: string | null;
}

export interface ProductoFuente {
  id: string;
  name: string;
  skuPrefix?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
}

export interface CantidadPorBodega {
  bodegaId: string;
  bodega: string;
  cantidad: number;
}

export interface ParDeLaFamilia {
  id: string;
  codigo: string;
  talla: string;
  estado: string;
  bodega: string;
  /** Está en una vitrina: ya está exhibido. */
  enVitrina: boolean;
  /** Es el código que se consultó. */
  esElCodigo: boolean;
}

export interface TallaDeLaFamilia {
  variantId: string;
  talla: string;
  color: string;
  codigo: string | null;
  sku: string | null;
  total: number;
  /**
   * De ese total, cuántos están dentro de cajas cerradas. Una caja sin
   * detallar cuenta en la talla que la representa, así que «41: 6» puede ser
   * dos pares sueltos y una caja de cuatro.
   */
  enCajas: number;
  porBodega: CantidadPorBodega[];
  /** Pares sueltos con sticker, en inventario. */
  pares: ParDeLaFamilia[];
  vendidos: number;
  esLaDelCodigo: boolean;
}

export interface CajaDeLaFamilia {
  id: string;
  codigo: string;
  estado: string;
  bodega: string;
  enVitrina: boolean;
  pares: number;
  esElCodigo: boolean;
  /** Solo en la caja de origen: los pares que salieron de ella. */
  hermanos?: ParDeLaFamilia[];
}

export interface Familia {
  producto: {
    id: string;
    nombre: string;
    referencia: string | null;
    marca: string | null;
    imageUrl: string | null;
  };
  /** La talla del código consultado, si se sabe. */
  tallaDelCodigo: string | null;
  tallas: TallaDeLaFamilia[];
  cajaDeOrigen: CajaDeLaFamilia | null;
  cajas: CajaDeLaFamilia[];
  totales: { pares: number; porBodega: CantidadPorBodega[] };
}

const ORDEN_ESTADO: Record<string, number> = {
  IN_STOCK: 0,
  TRANSFERRED: 1,
  CONSIGNED: 2,
  SPLIT: 3,
  SOLD: 4,
  WRITTEN_OFF: 5,
};

export function armarFamilia(fuente: {
  producto: ProductoFuente;
  variantes: VarianteFuente[];
  stocks: StockFuente[];
  bodegas: BodegaFuente[];
  unidades: UnidadFuente[];
  /** El código consultado: un bulto, o una talla si el código era de talla. */
  codigo: { unidadId?: string | null; variantId?: string | null };
}): Familia {
  const nombreDeBodega = new Map(fuente.bodegas.map((b) => [b.id, b.name]));
  const bodega = (id: string) => nombreDeBodega.get(id) ?? 'Bodega';
  const vitrinas = new Set(fuente.bodegas.filter((b) => b.esVitrina).map((b) => b.id));
  const unidadDelCodigo = fuente.unidades.find((u) => u.id === fuente.codigo.unidadId) ?? null;
  const variantDelCodigo = fuente.codigo.variantId ?? unidadDelCodigo?.variantId ?? null;

  const par = (u: UnidadFuente): ParDeLaFamilia => ({
    id: u.id,
    codigo: u.barcode,
    talla: (u.sizeName ?? '').trim(),
    estado: u.status,
    bodega: bodega(u.warehouseId),
    enVitrina: vitrinas.has(u.warehouseId),
    esElCodigo: u.id === unidadDelCodigo?.id,
  });
  const porEstadoYCodigo = (a: { estado: string; codigo: string }, b: { estado: string; codigo: string }) =>
    (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || a.codigo.localeCompare(b.codigo);

  const sumarPorBodega = (filas: { warehouseId: string; quantity: number | string }[]) => {
    const acumulado = new Map<string, number>();
    for (const f of filas) {
      const n = Number(f.quantity) || 0;
      if (n === 0) continue;
      acumulado.set(f.warehouseId, (acumulado.get(f.warehouseId) ?? 0) + n);
    }
    return [...acumulado.entries()]
      .map(([bodegaId, cantidad]) => ({ bodegaId, bodega: bodega(bodegaId), cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad || a.bodega.localeCompare(b.bodega, 'es'));
  };

  const tallas: TallaDeLaFamilia[] = fuente.variantes
    .filter((v) => v.isActive !== false || v.id === variantDelCodigo)
    .map((v) => {
      const stocks = fuente.stocks.filter((s) => s.variantId === v.id);
      const porBodega = sumarPorBodega(stocks);
      const pares = fuente.unidades
        .filter((u) => u.kind === 'UNIT' && u.variantId === v.id && u.status === 'IN_STOCK')
        .map(par)
        .sort(porEstadoYCodigo);
      const enCajas = fuente.unidades
        .filter((u) => u.kind === 'BOX' && u.variantId === v.id && u.status === 'IN_STOCK')
        .reduce((t, u) => t + (Number(u.quantity) || 0), 0);
      return {
        variantId: v.id,
        talla: (v.sizeName ?? '').trim(),
        color: (v.colorName ?? '').trim(),
        codigo: v.barcode ?? null,
        sku: v.sku ?? null,
        total: porBodega.reduce((t, b) => t + b.cantidad, 0),
        enCajas,
        porBodega,
        pares,
        vendidos: fuente.unidades.filter(
          (u) => u.kind === 'UNIT' && u.variantId === v.id && u.status === 'SOLD',
        ).length,
        esLaDelCodigo: v.id === variantDelCodigo,
      };
    })
    .sort((a, b) => compararTallas(a.talla, b.talla) || a.color.localeCompare(b.color, 'es'));

  const caja = (u: UnidadFuente): CajaDeLaFamilia => ({
    id: u.id,
    codigo: u.barcode,
    estado: u.status,
    bodega: bodega(u.warehouseId),
    enVitrina: vitrinas.has(u.warehouseId),
    pares: Number(u.quantity) || 0,
    esElCodigo: u.id === unidadDelCodigo?.id,
  });

  // La caja de origen: la del código si es una caja, o la caja padre del par.
  const origenId =
    unidadDelCodigo?.kind === 'BOX' ? unidadDelCodigo.id : unidadDelCodigo?.parentUnitId ?? null;
  const unidadOrigen = origenId ? fuente.unidades.find((u) => u.id === origenId) ?? null : null;
  const cajaDeOrigen = unidadOrigen
    ? {
        ...caja(unidadOrigen),
        hermanos: fuente.unidades
          .filter((u) => u.parentUnitId === unidadOrigen.id)
          .map(par)
          .sort((a, b) => compararTallas(a.talla, b.talla) || porEstadoYCodigo(a, b)),
      }
    : null;

  const cajas = fuente.unidades
    .filter((u) => u.kind === 'BOX' && u.status !== 'SPLIT' && u.status !== 'WRITTEN_OFF')
    .map(caja)
    .sort((a, b) => porEstadoYCodigo(a, b));

  return {
    producto: {
      id: fuente.producto.id,
      nombre: fuente.producto.name,
      referencia: fuente.producto.skuPrefix ?? null,
      marca: (fuente.producto.brand ?? '').trim() || null,
      imageUrl: fuente.producto.imageUrl ?? null,
    },
    tallaDelCodigo: tallas.find((t) => t.esLaDelCodigo)?.talla ?? null,
    tallas,
    cajaDeOrigen,
    cajas,
    totales: {
      pares: tallas.reduce((t, x) => t + x.total, 0),
      porBodega: sumarPorBodega(fuente.stocks),
    },
  };
}
