/**
 * A qué cliente se le factura un pedido de la página.
 *
 * «Si el cliente pide y escribe solo Miller se va a crear como otro cliente
 * […] hay posibilidad de anclarlo al número telefónico» (Andrea, Distri
 * Amber). Ya se buscaba por teléfono, pero el Miller de siempre venía de la
 * carga inicial **sin teléfono**: no había con qué compararlo y nacía otro.
 *
 * El ancla es el teléfono. Tres reglas:
 *  1. Mismo teléfono → ese cliente (el más antiguo si hay varios). Se compara
 *     por los últimos diez dígitos: `+57 320 749 9137` y `3207499137` son el
 *     mismo número.
 *  2. Si no, mismo nombre completo y **sin teléfono** → ese, y se le guarda
 *     el del pedido. Un homónimo con otro número no se toma solo: puede ser
 *     otra persona.
 *  3. Si no, uno nuevo. Pero antes se muestran los «parecidos» (mismo primer
 *     nombre) para que quien acepta elija: «Miller» no es «Miller Gómez»
 *     para una máquina, pero sí para Andrea.
 *
 * Cuando se elige un cliente sin teléfono, se le queda el del pedido: la
 * próxima vez lo reconoce la regla 1.
 */
import { claveDelNombre } from '../clients/fusionar-clientes.js';

export interface ClienteCandidato {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: Date | string;
}

export type MotivoDeCoincidencia = 'telefono' | 'nombre';

/** Solo dígitos y, si trae indicativo de Colombia, sin él. */
export function telefonoComparable(
  telefono: string | null | undefined,
): string {
  const d = (telefono ?? '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

export function mismoTelefono(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = telefonoComparable(a);
  // Menos de siete dígitos no es un teléfono: es basura del formulario.
  return x.length >= 7 && x === telefonoComparable(b);
}

/** La primera palabra del nombre, sin tildes ni mayúsculas. */
export function primerNombre(nombre: string | null | undefined): string {
  return (
    claveDelNombre({ firstName: nombre ?? '', lastName: '' }).split(' ')[0] ??
    ''
  );
}

const antiguedad = (c: ClienteCandidato) => new Date(c.createdAt).getTime();

export function elegirClienteDelPedido<T extends ClienteCandidato>(
  pedido: { nombre: string | null; telefono: string | null },
  candidatos: T[],
): { cliente: T | null; motivo: MotivoDeCoincidencia | null; parecidos: T[] } {
  const orden = [...candidatos].sort((a, b) => antiguedad(a) - antiguedad(b));

  let cliente: T | null =
    orden.find((c) => mismoTelefono(c.phone, pedido.telefono)) ?? null;
  let motivo: MotivoDeCoincidencia | null = cliente ? 'telefono' : null;

  if (!cliente) {
    const clave = claveDelNombre({
      firstName: pedido.nombre ?? '',
      lastName: '',
    });
    const mismos = orden.filter(
      (c) =>
        clave && claveDelNombre(c) === clave && !telefonoComparable(c.phone),
    );
    // Dos «Miller Gómez» sin teléfono: no se adivina cuál.
    if (mismos.length === 1) {
      cliente = mismos[0];
      motivo = 'nombre';
    }
  }

  const primero = primerNombre(pedido.nombre);
  const parecidos = primero
    ? orden.filter(
        (c) => c.id !== cliente?.id && primerNombre(c.firstName) === primero,
      )
    : [];

  return { cliente, motivo, parecidos: parecidos.slice(0, 6) };
}
