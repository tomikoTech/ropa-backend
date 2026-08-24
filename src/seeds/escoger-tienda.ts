/**
 * A qué tienda le estamos creando la cuenta.
 *
 * En local hay una y «la primera» acierta siempre. En producción hay muchas y
 * «la primera» es la de otro cliente: un usuario ajeno metido en la tienda
 * equivocada no se deshace con un ctrl+z. Por eso, con varias, esto se niega
 * en vez de adivinar.
 */
export interface Tienda {
  id: string;
  name: string;
  slug: string;
}

export function escogerTienda(
  tiendas: Tienda[],
  slug: string | undefined,
): Tienda {
  if (tiendas.length === 0) {
    throw new Error('No hay ninguna tienda en esta base.');
  }
  const cuales = () => tiendas.map((t) => t.slug).join(', ');

  if (!slug) {
    if (tiendas.length > 1) {
      throw new Error(
        `Esta base tiene ${tiendas.length} tiendas. Indica cuál con TENANT=<slug>. Hay: ${cuales()}`,
      );
    }
    return tiendas[0];
  }

  // Con slug se busca siempre, incluso si hay una sola tienda: escribirlo mal
  // y que igual pase sería peor que fallar.
  const tienda = tiendas.find((t) => t.slug === slug);
  if (!tienda) {
    throw new Error(`No existe la tienda "${slug}". Hay: ${cuales()}`);
  }
  return tienda;
}
