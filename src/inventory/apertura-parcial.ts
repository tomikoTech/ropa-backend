/**
 * Sacar unos pares de la caja y dejar el resto adentro.
 *
 * Abrir la caja entera era lo único que se podía hacer, y no es lo que pasa en
 * el mostrador: llega una caja de 24 y se sacan **tres** para la vitrina, o los
 * dos que pidió un cliente. Con la única opción disponible, o se abría entera
 * —24 etiquetas para imprimir y pegar— o no se abría.
 *
 * En demachine esto es marcar unos hijos del árbol y dejar los otros: la caja
 * se queda con `cantidad − marcados`. Acá es lo mismo dicho por talla, que es
 * como se sabe qué par sale.
 *
 * Sin base de datos: entra el contenido de la caja y lo que se quiere sacar,
 * sale lo que sale y lo que queda. Los errores son el texto que ve quien está
 * con la caja en la mano.
 */

export interface RenglonDeTalla {
  sizeId: string;
  quantity: number;
}

export interface Apertura {
  /** Lo que sale de la caja y se convierte en pares con código propio. */
  sale: RenglonDeTalla[];
  /** Lo que sigue adentro. Vacío cuando la caja se abrió entera. */
  queda: RenglonDeTalla[];
  totalQueSale: number;
  totalQueQueda: number;
  /** Si no queda nada, la caja deja de existir como caja. */
  seVacia: boolean;
}

export class AperturaImposible extends Error {}

/**
 * Qué sale y qué queda.
 *
 * `pedido` sin definir es «toda la caja», que es como se abría siempre y sigue
 * siendo el caso normal. Una talla que no se nombra es una talla que **no
 * sale**: no hay forma de pedir de menos por olvido y que el sistema complete
 * por su cuenta.
 */
export function repartoDeLaApertura(
  contenido: RenglonDeTalla[],
  pedido?: RenglonDeTalla[],
): Apertura {
  const dentro = contenido.filter((r) => r.quantity > 0);
  const totalDentro = dentro.reduce((suma, r) => suma + r.quantity, 0);
  if (totalDentro <= 0) {
    throw new AperturaImposible(
      'La caja no tiene un contenido detallado. Registra sus tallas antes de abrirla.',
    );
  }

  if (!pedido) {
    return {
      sale: dentro.map((r) => ({ ...r })),
      queda: [],
      totalQueSale: totalDentro,
      totalQueQueda: 0,
      seVacia: true,
    };
  }

  const pedidas = pedido.filter((r) => r.quantity !== 0);
  if (pedidas.length === 0) {
    throw new AperturaImposible('Elige cuántos pares salen de la caja.');
  }
  const repetida = pedidas.find(
    (r, i) => pedidas.findIndex((otra) => otra.sizeId === r.sizeId) !== i,
  );
  if (repetida) {
    throw new AperturaImposible('Cada talla solo puede aparecer una vez.');
  }

  const hayPorTalla = new Map(dentro.map((r) => [r.sizeId, r.quantity]));
  for (const r of pedidas) {
    if (!Number.isInteger(r.quantity) || r.quantity < 0) {
      throw new AperturaImposible('Los pares que salen se cuentan enteros.');
    }
    const hay = hayPorTalla.get(r.sizeId);
    if (hay === undefined) {
      throw new AperturaImposible(
        'Esa talla no está dentro de la caja. Corrige primero lo que trae.',
      );
    }
    if (r.quantity > hay) {
      throw new AperturaImposible(
        `La caja tiene ${hay} pares de esa talla y estás sacando ${r.quantity}.`,
      );
    }
  }

  const sale = pedidas.filter((r) => r.quantity > 0).map((r) => ({ ...r }));
  const salePorTalla = new Map(sale.map((r) => [r.sizeId, r.quantity]));
  const queda = dentro
    .map((r) => ({
      sizeId: r.sizeId,
      quantity: r.quantity - (salePorTalla.get(r.sizeId) ?? 0),
    }))
    .filter((r) => r.quantity > 0);

  const totalQueSale = sale.reduce((suma, r) => suma + r.quantity, 0);
  const totalQueQueda = queda.reduce((suma, r) => suma + r.quantity, 0);
  return {
    sale,
    queda,
    totalQueSale,
    totalQueQueda,
    seVacia: totalQueQueda === 0,
  };
}
