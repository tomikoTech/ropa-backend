/**
 * Qué ventas pendientes ve cada quien, y cómo se llaman en pantalla.
 *
 * Una cotización y una «venta esperando autorización» son la misma fila con dos
 * significados. Quien vende ya cerró el trato con el cliente y está esperando el
 * visto bueno; quien autoriza está mirando pedidos ajenos. Llamarle
 * «cotización» a los dos deja a uno de los dos leyendo la palabra equivocada.
 *
 * Y hay una regla de fondo detrás del rótulo: **quien vende no se autoriza a sí
 * mismo**. Autorizar es `edit` sobre el módulo; crear es `create`. Un perfil
 * con `rc` puede proponer y no puede aprobar, y esa separación es todo el
 * sentido del flujo.
 *
 * De ahí sale también qué se lista: quien no puede autorizar no tiene por qué
 * ver los pedidos de los demás vendedores.
 */

export interface QuienMira {
  /** Tiene la acción `edit` sobre cotizaciones. */
  puedeAutorizar: boolean;
}

export interface RotulosDePantalla {
  titulo: string;
  subtitulo: string;
  /** Lo que dice el botón que crea una. */
  crear: string;
  vacio: string;
}

export function rotulosDeVentasPendientes(quien: QuienMira): RotulosDePantalla {
  if (quien.puedeAutorizar) {
    return {
      titulo: 'Ventas por autorizar',
      subtitulo:
        'Pedidos que esperan tu visto bueno. Al autorizar se convierten en venta y descuentan inventario.',
      crear: 'Nueva venta por autorizar',
      vacio: 'No hay ventas esperando autorización.',
    };
  }
  return {
    titulo: 'Mis ventas por autorizar',
    subtitulo:
      'Lo que ya vendiste y está esperando el visto bueno. Todavía no descuenta inventario.',
    crear: 'Nueva venta',
    vacio: 'Todavía no has dejado ninguna venta esperando autorización.',
  };
}

/**
 * Solo las propias, si no puede autorizar.
 *
 * `findAll` devolvía **todas las del tenant**: un vendedor externo vería los
 * pedidos de los demás, con sus clientes y sus precios.
 */
export function soloLasSuyas(
  quien: QuienMira,
  usuarioId: string,
): string | null {
  return quien.puedeAutorizar ? null : usuarioId;
}

/**
 * Qué estados están **esperando** algo de alguien.
 *
 * `CONVERTED` ya es una venta y `EXPIRED` se venció sola: ninguna de las dos
 * pide acción. Las demás sí, y son las que el contador del menú tiene que
 * mostrar — a quien vende, para saber qué le falta que le aprueben; a quien
 * autoriza, para saber qué tiene encima.
 */
export const ESTADOS_PENDIENTES = ['DRAFT', 'SENT', 'APPROVED'] as const;

export function estaPendiente(estado: string): boolean {
  return (ESTADOS_PENDIENTES as readonly string[]).includes(estado);
}
