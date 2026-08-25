/**
 * Planes contra oficios.
 *
 * Hay dos cosas distintas donde hoy solo hay «roles».
 *
 * Un **oficio** —cajero, jefe de bodega, vendedor externo— es de la tienda:
 * ella lo crea, lo ajusta y se lo asigna a su gente. Nadie mas debe meterse.
 *
 * Un **plan** —«Revendedor (persona natural)»— no es un oficio dentro de una
 * tienda: es lo que esa persona contrato con nosotros, y sus permisos son
 * exactamente lo que esta pagando. Dejar que el administrador de una tienda lo
 * edite o lo borre es como dejarle editar su propia factura.
 *
 * La lista es corta y explicita a proposito: agregar un plan es una decision
 * comercial, no algo que deba pasar sin que nadie lo note.
 */
export const PLANES = ['revendedor'] as const;

export function esPlanDeLaPlataforma(
  templateKey: string | null | undefined,
): boolean {
  return !!templateKey && (PLANES as readonly string[]).includes(templateKey);
}

export interface Veredicto {
  permitido: boolean;
  porque?: string;
}

export function puedeLaTiendaTocarlo(rol: {
  templateKey: string | null | undefined;
}): Veredicto {
  if (!esPlanDeLaPlataforma(rol.templateKey)) return { permitido: true };
  return {
    permitido: false,
    porque:
      'Este rol viene con el plan contratado y no se edita desde la tienda. ' +
      'Si necesitas otros permisos, escribenos.',
  };
}
