import { usaBodegas } from './usa-bodegas.js';
import { findRoleTemplate } from '../access/role-templates.js';

const perfil = (mods: Record<string, boolean>) =>
  Object.entries(mods).map(([module, list]) => ({
    module,
    list,
    create: false,
    edit: false,
    delete: false,
  }));

describe('a que perfiles hay que asignarles bodegas', () => {
  // El revendedor no tiene bodega: es persona natural, compra al detal y
  // revende. Asignarle una es dato equivocado, aunque no le sirva de nada.
  it('el revendedor, no', () => {
    expect(usaBodegas(findRoleTemplate('revendedor')!.permissions)).toBe(false);
  });

  it('el vendedor externo, si: vende de las bodegas que se le asignen', () => {
    expect(usaBodegas(findRoleTemplate('vendedor-externo')!.permissions)).toBe(
      true,
    );
  });

  it('el cajero, si', () => {
    expect(usaBodegas(findRoleTemplate('cajero')!.permissions)).toBe(true);
  });

  it('quien ve inventario, aunque no vea la pantalla de bodegas', () => {
    expect(usaBodegas(perfil({ inventory: true, warehouses: false }))).toBe(
      true,
    );
  });

  it('un rol vacio, no', () => {
    expect(usaBodegas([])).toBe(false);
  });
});
