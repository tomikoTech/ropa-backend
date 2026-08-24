import { rolAUsar } from './reusar-rol.js';

describe('rolAUsar', () => {
  // access_roles tiene UNIQUE (tenant_id, name): crear el rol otra vez para el
  // segundo vendedor de la misma tienda reventaba con «duplicate key».
  it('si el rol ya existe en la tienda, se reutiliza', () => {
    expect(rolAUsar({ id: 'r1' })).toEqual({ id: 'r1', crear: false });
  });

  it('si no existe, hay que crearlo', () => {
    expect(rolAUsar(undefined)).toEqual({ id: null, crear: true });
  });
});
