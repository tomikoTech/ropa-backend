import { MODULO_POS_TERCEROS, soloVendeDeTerceros } from './pos-de-terceros.js';

const puede =
  (m: Record<string, string[]>) =>
  (modulo: string, accion = 'list') =>
    (m[modulo] ?? []).includes(accion);

const personaNatural = puede({
  [MODULO_POS_TERCEROS]: ['list'],
  consignments: ['list', 'create'],
});
const tienda = puede({
  sales: ['list', 'create'],
  consignments: ['list', 'create'],
  inventory: ['list', 'create', 'edit'],
});

describe('quien solo vende cosas de otros', () => {
  // Es un permiso propio y no algo deducido. Ya se intento deducir una
  // pantalla de otros permisos —la del vendedor con bodegas— y darle a alguien
  // un permiso mas le cambiaba la pantalla entera sin querer.
  it('la persona natural, si', () => {
    expect(soloVendeDeTerceros(personaNatural)).toBe(true);
  });

  it('una tienda con inventario propio, no', () => {
    expect(soloVendeDeTerceros(tienda)).toBe(false);
  });

  it('sin permisos cargados, no', () => {
    expect(soloVendeDeTerceros(null)).toBe(false);
  });

  // `userCan` le dice que si a todo a quien no tiene matriz: sin esto, el
  // administrador acabaria con el punto de venta recortado.
  it('el administrador nunca, aunque diga que si a todo', () => {
    expect(soloVendeDeTerceros(() => true, { sinMatriz: true })).toBe(false);
  });

  it('pero con matriz, un si sigue valiendo', () => {
    expect(soloVendeDeTerceros(() => true, { sinMatriz: false })).toBe(true);
  });
});
