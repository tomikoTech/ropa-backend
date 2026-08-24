/**
 * `access_roles` tiene UNIQUE (tenant_id, name): el rol es de la tienda, no
 * del usuario. El segundo vendedor externo de la misma tienda comparte el rol
 * del primero en vez de reventar con «duplicate key».
 */
export function rolAUsar(existente: { id: string } | undefined): {
  id: string | null;
  crear: boolean;
} {
  return existente
    ? { id: existente.id, crear: false }
    : { id: null, crear: true };
}
