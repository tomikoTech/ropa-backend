/**
 * A quién se le cede la mercancía: a una persona o a una bodega.
 *
 * La cesión —lo que hasta ahora se llamaba «calle»— es prestar mercancía que
 * **sigue siendo del origen**. Sale, y vuelve como plata (si se vendió) o como
 * devolución (si no). Empezó existiendo solo para los patinadores, así que el
 * destino era siempre una persona.
 *
 * Ahora también puede ser una bodega u otro local: «que la bodega principal le
 * preste a otra bodega u otro local dentro del mismo sistema». Y sirve en los
 * dos sentidos sin nada especial: «local presta a la principal» es elegir
 * origen = local y destino = principal. Es el mismo formulario al revés.
 *
 * **No confundirla con un traslado.** El traslado cambia de dueño: la
 * mercancía llega a la otra bodega, se recibe y se acabó. La cesión deja una
 * deuda de mercancía abierta. Son cosas distintas y por eso conviven.
 *
 * Esta regla decide si el destino está bien puesto. Vive aparte porque un
 * destino torcido —dos a la vez, ninguno, o la bodega prestándose a sí misma—
 * descuadra el inventario sin que nadie lo note hasta el conteo.
 */

export type TipoDeDestino = 'PERSONA' | 'BODEGA';

export interface DestinoPedido {
  tipo: TipoDeDestino;
  /** Id del patinador, cuando es una persona. */
  personaId?: string | null;
  /** Id de la bodega destino, cuando es una bodega. */
  bodegaId?: string | null;
  /** De dónde sale la mercancía. */
  bodegaOrigenId: string;
}

export interface DestinoResuelto {
  tipo?: TipoDeDestino;
  personaId?: string | null;
  bodegaId?: string | null;
  /** En palabras de la tienda, para mostrárselo tal cual. */
  error?: string;
}

export function resolverDestino(pedido: DestinoPedido): DestinoResuelto {
  const persona = (pedido.personaId ?? '').trim();
  const bodega = (pedido.bodegaId ?? '').trim();

  if (pedido.tipo === 'PERSONA') {
    if (!persona) {
      return { error: 'Elige a quién se le entrega la mercancía.' };
    }
    // El otro campo se ignora en vez de rechazarse: el formulario recuerda lo
    // que se eligió en la otra pestaña, y eso no es un error de nadie.
    return { tipo: 'PERSONA', personaId: persona, bodegaId: null };
  }

  if (pedido.tipo === 'BODEGA') {
    if (!bodega) {
      return { error: 'Elige a qué bodega o local se le entrega la mercancía.' };
    }
    if (bodega === pedido.bodegaOrigenId) {
      // Una bodega prestándose a sí misma sale del inventario y vuelve al
      // mismo sitio: no mueve nada y deja una deuda que nadie va a cobrar.
      return {
        error: 'La bodega de origen y la de destino no pueden ser la misma.',
      };
    }
    return { tipo: 'BODEGA', personaId: null, bodegaId: bodega };
  }

  return { error: 'Elige si la cesión va a una persona o a una bodega.' };
}

/** Cómo se lee el destino de una cesión ya guardada. */
export function nombreDelDestino(cesion: {
  destinoTipo?: TipoDeDestino | null;
  persona?: { name: string } | null;
  bodegaDestino?: { name: string } | null;
}): string {
  if (cesion.destinoTipo === 'BODEGA') {
    return cesion.bodegaDestino?.name ?? 'Bodega';
  }
  // Sin tipo son las cesiones de antes de que existieran las bodegas: todas
  // eran a un patinador. Se leen bien en vez de salir vacías.
  return cesion.persona?.name ?? 'Sin destino';
}
