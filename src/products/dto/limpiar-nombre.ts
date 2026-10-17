import type { TransformFnParams } from 'class-transformer';

/**
 * «LIGHT BLUE » y «LIGHT BLUE» eran dos productos a la vista de nadie: el
 * espacio del final no se ve, pero separa, y en Distri Amber había 63 nombres
 * así. Sin espacios a los lados ni dobles adentro.
 */
export function limpiarNombre({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;
}
