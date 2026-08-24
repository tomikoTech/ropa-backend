/**
 * Si a este perfil tiene sentido asignarle bodegas.
 *
 * El revendedor es persona natural: compra al detal y revende, no tiene bodega
 * ni inventario. El seed se las asignaba igual —«Bodegas: AMAWAD»— y eso es
 * dato equivocado, aunque no le sirva de nada porque tampoco puede verlas.
 */
interface Permiso {
  module: string;
  list: boolean;
}

export function usaBodegas(permisos: Permiso[]): boolean {
  const ve = (module: string) =>
    !!permisos.find((p) => p.module === module)?.list;
  // `inventory` cuenta aunque no vea la pantalla de bodegas: el alcance por
  // bodega es lo que limita lo que puede tocar del inventario.
  return ve('warehouses') || ve('inventory');
}
