/**
 * Cuánto nos sale cada perfume, perfume por perfume.
 *
 * Andrea (audio del 4 oct 2026): «una página, un lugarcito, donde diga costo
 * de perfumes y vaya anclado lo que vale cada perfume: el frasco, la esencia
 * que quedamos en 7.000, la mano de obra que quedamos en 7.000 —pero que se
 * pueda editar—, el valor total, y una parte donde se le ponga descuento,
 * porque a veces se le pone el 15, el 20 o el 10, para saber en cuánto nos
 * sale realmente cada perfume».
 *
 * La suma es la misma de `costo-del-terminado.ts` (frasco + esencia fija +
 * mano de obra): acá no se inventa otro costo, se le pone al lado el precio
 * de venta y lo que queda con cada descuento de los que usan. Una utilidad
 * negativa no se esconde: es justo lo que quieren ver antes de regalar el
 * 30 %.
 *
 * Todo en pesos enteros, sin base de datos.
 */
import {
  costoDelTerminado,
  type CostoDelTerminado,
  type InsumosDelCosto,
} from './costo-del-terminado.js';

export interface PerfumeParaCostear extends InsumosDelCosto {
  /** `products.base_price`: a lo que se vende sin descuento. */
  precioDeVenta: number | null | undefined;
}

export interface UtilidadConDescuento {
  porcentaje: number;
  /** Lo que se cobra con ese descuento. */
  precio: number;
  /** Precio con descuento menos el costo; negativa si se pierde. */
  utilidad: number;
}

export interface CostoDelPerfume extends CostoDelTerminado {
  precioDeVenta: number;
  /** Precio de lista menos costo. */
  utilidad: number;
  /** Una fila por preset de descuento de la tienda, en el orden de la tienda. */
  conDescuento: UtilidadConDescuento[];
}

const entero = (n: number | null | undefined) =>
  Math.max(0, Math.round(Number(n) || 0));

/** 60.000 con 15 % → 51.000. Redondea al peso, como cobra el POS. */
export function precioConDescuento(precio: number, porcentaje: number): number {
  const p = Math.min(100, Math.max(0, Number(porcentaje) || 0));
  return Math.round(entero(precio) * (1 - p / 100));
}

export function costoDelPerfume(
  perfume: PerfumeParaCostear,
  presets: number[] | null | undefined,
): CostoDelPerfume {
  const costo = costoDelTerminado(perfume);
  const precioDeVenta = entero(perfume.precioDeVenta);
  const porcentajes = [
    ...new Set((presets ?? []).map((p) => Number(p))),
  ].filter((p) => Number.isFinite(p) && p > 0 && p <= 100);
  return {
    ...costo,
    precioDeVenta,
    utilidad: precioDeVenta - costo.total,
    conDescuento: porcentajes.map((porcentaje) => {
      const precio = precioConDescuento(precioDeVenta, porcentaje);
      return { porcentaje, precio, utilidad: precio - costo.total };
    }),
  };
}
