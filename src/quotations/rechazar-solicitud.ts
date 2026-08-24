/**
 * Rechazar una venta que espera autorización.
 *
 * Hasta ahora una solicitud solo podía convertirse en venta o vencerse sola.
 * Al vendedor eso le deja la duda: no sabía si le habían dicho que no, o si
 * todavía nadie la había mirado.
 */
export const ESTADO_RECHAZADA = 'REJECTED';

/** Los que todavía esperan una decisión de alguien. */
const ESPERANDO = ['DRAFT', 'SENT', 'APPROVED'];

export interface Veredicto {
  permitido: boolean;
  porque?: string;
}

export function puedeRechazarse(estado: string, motivo?: string): Veredicto {
  if (estado === ESTADO_RECHAZADA) {
    return { permitido: false, porque: 'Esta solicitud ya está rechazada.' };
  }
  if (estado === 'CONVERTED') {
    return {
      permitido: false,
      porque:
        'Esta solicitud ya es una venta: descontó inventario y cobró. Para deshacerla hay que anular la venta.',
    };
  }
  if (!ESPERANDO.includes(estado)) {
    return {
      permitido: false,
      porque: 'Esta solicitud ya no espera autorización.',
    };
  }
  // El motivo lo lee el vendedor, que no estuvo en la conversación. Sin él, el
  // rechazo es un «no» sin explicación.
  if (motivo !== undefined && motivo.trim() === '') {
    return { permitido: false, porque: 'Escribe el motivo del rechazo.' };
  }
  return { permitido: true };
}
