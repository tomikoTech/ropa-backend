/**
 * Números que llegan por la barra de direcciones.
 *
 * Un `Number(query)` suelto convierte `?limit=abc` en `NaN` y `?limit=999999`
 * en una consulta que se trae la tabla entera. Aquí un valor que no sirve se
 * trata como "no lo mandaron" —que es lo que quiso decir— y el tope se aplica
 * siempre, para que ningún parámetro de la URL decida cuánta base se lee.
 */
export function parsePositiveInt(
  value: string | number | undefined | null,
  options: { max?: number } = {},
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const entero = Math.floor(parsed);
  if (entero <= 0) return undefined;
  return options.max ? Math.min(entero, options.max) : entero;
}

/** Igual, pero admitiendo el 0 (útil para `offset`). */
export function parseNonNegativeInt(
  value: string | number | undefined | null,
  options: { max?: number } = {},
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const entero = Math.floor(parsed);
  if (entero < 0) return undefined;
  return options.max ? Math.min(entero, options.max) : entero;
}
