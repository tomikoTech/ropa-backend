/**
 * A qué bodegas tendrá acceso la cuenta.
 *
 * Devuelve `null` cuando no debe quedar restringida, y no la lista entera: en
 * esta base «sin bodegas asignadas» significa *todas* (ver
 * `AccessService.allowedWarehouses`). Insertar las dos de hoy dejaría fuera la
 * que creen mañana, que es justo lo que nadie se acuerda de arreglar.
 */
export interface Bodega {
  id: string;
  name: string;
}

export function escogerBodegas(
  bodegas: Bodega[],
  pedida: string | undefined,
): Bodega[] | null {
  if (bodegas.length === 0) {
    throw new Error('La tienda no tiene bodegas activas.');
  }
  const cuales = () => bodegas.map((b) => b.name).join(', ');

  if (!pedida) return [bodegas[0]];
  if (pedida.trim().toLowerCase() === 'todas') return null;

  const escogidas: Bodega[] = [];
  for (const nombre of pedida.split(',').map((n) => n.trim())) {
    const bodega = bodegas.find((b) => b.name === nombre);
    if (!bodega) {
      throw new Error(`No existe la bodega "${nombre}". Hay: ${cuales()}`);
    }
    if (!escogidas.some((e) => e.id === bodega.id)) escogidas.push(bodega);
  }
  return escogidas;
}
