/**
 * Dos fichas del mismo cliente, y cuál se queda.
 *
 * Pasó en Distri Amber: 115 de 126 clientes estaban repetidos. La tanda del
 * 3 de julio tenía nombre y apellido separados; el importador del 3 de agosto
 * comparaba solo el primer nombre contra el nombre completo, no los encontró
 * y los creó de nuevo. En veinte parejas **las dos** copias tienen ventas:
 * no se puede borrar, hay que **fusionar** —mover lo de una a la otra—.
 *
 * Acá vive la parte que se puede probar sin base de datos: cómo se decide que
 * dos nombres son el mismo, quién sobrevive y qué datos se le copian.
 */

export interface ClienteParaFusion {
  id: string;
  firstName: string | null;
  lastName: string | null;
  documentNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  createdAt: Date | string;
}

/** «Lilia  Peñalosa» y «LILIA PENALOSA» son la misma clave. */
export function claveDelNombre(c: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return `${c.firstName ?? ''} ${c.lastName ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Los grupos de dos o más fichas con la misma clave. */
export function agruparDuplicados<T extends ClienteParaFusion>(
  clientes: T[],
): T[][] {
  const porClave = new Map<string, T[]>();
  for (const c of clientes) {
    const k = claveDelNombre(c);
    if (!k) continue;
    porClave.set(k, [...(porClave.get(k) ?? []), c]);
  }
  return [...porClave.values()].filter((g) => g.length > 1);
}

export interface PlanDeFusion<T extends ClienteParaFusion> {
  sobrevive: T;
  absorbidos: T[];
  /** Lo que el sobreviviente no tenía y alguna copia sí. */
  completar: Partial<Pick<T, 'documentNumber' | 'phone' | 'email' | 'address'>>;
}

/**
 * Sobrevive la ficha **más antigua**: es la que tiene el nombre bien partido
 * (nombre y apellido) y el id que más documentos viejos apuntan. Las demás
 * le entregan sus ventas y, de paso, el teléfono o la dirección que ella no
 * tenía.
 */
export function planDeFusion<T extends ClienteParaFusion>(
  grupo: T[],
): PlanDeFusion<T> {
  if (grupo.length < 2)
    throw new Error('Un grupo de fusión necesita al menos dos fichas');
  const ordenado = [...grupo].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const [sobrevive, ...absorbidos] = ordenado;
  const completar: PlanDeFusion<T>['completar'] = {};
  for (const campo of [
    'documentNumber',
    'phone',
    'email',
    'address',
  ] as const) {
    if (sobrevive[campo]) continue;
    const donante = absorbidos.find((a) => a[campo]);
    if (donante) completar[campo] = donante[campo];
  }
  return { sobrevive, absorbidos, completar };
}

/** Las tablas que apuntan a `clients.client_id` y hay que mover. */
export const TABLAS_QUE_APUNTAN_AL_CLIENTE = [
  'sales',
  'accounts_receivable',
  'quotations',
  'reservations',
  'returns',
] as const;
