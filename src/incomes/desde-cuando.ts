/**
 * Desde cuándo cuenta la tesorería.
 *
 * Distri Amber empezó a usar Bancos e Ingresos en octubre de 2026, pero el
 * sistema traía 643 abonos históricos en efectivo cargados desde el Excel:
 * el saldo de efectivo decía 483 millones que nunca estuvieron en la caja.
 * La tienda elige un día (`tesoreriaDesde`) y todo lo anterior deja de sumar.
 * El saldo que había ese día se carga como un ajuste fechado ahí.
 *
 * Regla pura, sin base de datos. El día es colombiano: `rangoUtcDelDia`
 * convierte «1 de octubre» en el instante exacto en que empezó ese día en
 * la tienda, no en Londres.
 */
import { rangoUtcDelDia } from '../caja/cuadre.js';

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface RangoEfectivo {
  /** Instante desde el que se suma (inclusive); `null` = desde siempre. */
  desde: Date | null;
  /** Instante hasta el que se suma (inclusive); `null` = sin tope. */
  hasta: Date | null;
  /** El día configurado, tal cual (`YYYY-MM-DD`), o `null`. */
  tesoreriaDesde: string | null;
  /** Texto para la pantalla; `null` cuando no hay fecha configurada. */
  aviso: string | null;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** «1 de octubre de 2026», como se dice. */
export function diaEnPalabras(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Un instante a partir de lo que llega por la URL: día o fecha completa. */
function instante(valor: string | undefined, finDelDia: boolean): Date | null {
  if (!valor) return null;
  if (DIA_ISO.test(valor)) {
    const r = rangoUtcDelDia(valor);
    // El día completo: el rango de `rangoUtcDelDia` es [desde, hasta), así que
    // el tope inclusive es un milisegundo antes de la medianoche siguiente.
    return finDelDia ? new Date(r.hasta.getTime() - 1) : r.desde;
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * El rango que de verdad se consulta: el pedido por el usuario, recortado
 * para que nunca empiece antes de `tesoreriaDesde`.
 */
export function rangoEfectivo(
  tesoreriaDesde: string | null | undefined,
  pedido: { from?: string; to?: string } = {},
): RangoEfectivo {
  const configurado =
    tesoreriaDesde && DIA_ISO.test(tesoreriaDesde) ? tesoreriaDesde : null;
  const piso = configurado ? rangoUtcDelDia(configurado).desde : null;
  const desdePedido = instante(pedido.from, false);
  const hasta = instante(pedido.to, true);

  let desde: Date | null = desdePedido;
  if (piso && (!desde || desde < piso)) desde = piso;

  return {
    desde,
    hasta,
    tesoreriaDesde: configurado,
    aviso: configurado
      ? `Contando desde el ${diaEnPalabras(configurado)}`
      : null,
  };
}
