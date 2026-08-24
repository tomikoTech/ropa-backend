/**
 * De quien es la plata que cada uno ve.
 *
 * Los perfiles simplificados —el que vende de unas bodegas y el que revende
 * cosas de terceros— llevan **su** contabilidad, no la de la tienda. Dos
 * personas naturales en la misma tienda no pueden verse la plata.
 *
 * Una sola regla para las dos listas que la necesitan —ventas y ventas de
 * terceros—, porque son la misma pregunta.
 */
import {
  usaPantallaSimple,
  type Puede,
  type Quien,
} from './pantalla-de-ventas.js';
import { soloVendeDeTerceros } from './pos-de-terceros.js';

/** El id al que limitar la consulta, o `null` para no limitarla. */
export function soloLoSuyo(
  puede: Puede | null,
  usuarioId: string,
  quien: Quien = { sinMatriz: false },
): string | null {
  if (!puede) return usuarioId;
  const simplificado =
    usaPantallaSimple(puede, quien) || soloVendeDeTerceros(puede, quien);
  return simplificado ? usuarioId : null;
}
