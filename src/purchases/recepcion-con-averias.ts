/**
 * Lo que llegó de una compra, y lo que llegó malo.
 *
 * «Qué hago si en la factura agregué 100 frascos y me llegó uno malo: voy a
 * meter 99 al inventario, no siento». Antes la única salida era recibir 99 y
 * que la compra quedara eternamente «parcial», o recibir 100 y que el frasco
 * roto se vendiera en el sistema.
 *
 * La regla: lo **recibido** cierra la compra (llegaron 100), y lo **averiado**
 * entra y se da de baja en el mismo acto, con quién y por qué. Así la compra
 * cuadra con la factura del proveedor, el inventario cuadra con el estante, y
 * el frasco roto queda en Movimientos como lo que es: una pérdida.
 */

export interface RenglonRecibido {
  ordenadas: number;
  /** Lo que ya se había recibido en recepciones anteriores. */
  yaRecibidas: number;
  recibidas: number;
  averiadas?: number | null;
}

export interface RecepcionResuelta {
  recibidas: number;
  averiadas: number;
  /** Lo que de verdad queda para vender: recibidas − averiadas. */
  disponibles: number;
  /** Lo que sigue sin llegar después de esta recepción. */
  pendientes: number;
  error?: string;
}

const entero = (n: number | null | undefined) => Math.round(Number(n) || 0);

export function resolverRecepcion(r: RenglonRecibido): RecepcionResuelta {
  const recibidas = entero(r.recibidas);
  const averiadas = entero(r.averiadas);
  const pendientesAntes = Math.max(
    0,
    entero(r.ordenadas) - entero(r.yaRecibidas),
  );
  const base = {
    recibidas,
    averiadas,
    disponibles: Math.max(0, recibidas - averiadas),
    pendientes: Math.max(0, pendientesAntes - recibidas),
  };
  if (recibidas < 0 || averiadas < 0)
    return { ...base, error: 'Las cantidades no pueden ser negativas.' };
  if (recibidas > pendientesAntes) {
    return {
      ...base,
      error: `Se pidieron ${pendientesAntes} y se están recibiendo ${recibidas}: no pueden llegar más de las pedidas.`,
    };
  }
  if (averiadas > recibidas) {
    return {
      ...base,
      error: `No pueden venir ${averiadas} averiadas si llegaron ${recibidas}.`,
    };
  }
  return base;
}
