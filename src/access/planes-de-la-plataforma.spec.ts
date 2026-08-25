import {
  esPlanDeLaPlataforma,
  puedeLaTiendaTocarlo,
  PLANES,
} from './planes-de-la-plataforma.js';
import { ROLE_TEMPLATES } from './role-templates.js';

/**
 * Hay dos cosas distintas donde hoy solo hay «roles».
 *
 * **Oficios**: cajero, jefe de bodega, vendedor externo. Son de la tienda, que
 * los crea, los ajusta y se los asigna a su gente. Nadie mas debe meterse.
 *
 * **Planes**: «Revendedor (persona natural)». Eso no es un oficio dentro de una
 * tienda: es lo que la persona **contrato con nosotros**, y sus permisos son
 * exactamente lo que esta pagando. Que el administrador de una tienda pueda
 * editarlo o borrarlo es como dejar que edite su propia factura.
 */
describe('cuales son planes y cuales oficios', () => {
  it('el revendedor es un plan', () => {
    expect(esPlanDeLaPlataforma('revendedor')).toBe(true);
  });

  it.each(['cajero', 'gerente', 'jefe-bodega', 'vendedor-externo', 'vendedor-directo'])(
    '%s es un oficio de la tienda',
    (key) => {
      expect(esPlanDeLaPlataforma(key)).toBe(false);
    },
  );

  it('un rol hecho a mano, sin plantilla, es de la tienda', () => {
    expect(esPlanDeLaPlataforma(null)).toBe(false);
    expect(esPlanDeLaPlataforma(undefined)).toBe(false);
    expect(esPlanDeLaPlataforma('')).toBe(false);
  });

  // El vendedor externo si es un oficio: una tienda contrata a alguien que
  // vende de sus bodegas. La diferencia con el revendedor es que este ultimo
  // no pertenece a ninguna tienda.
  it('la lista de planes es corta y explicita', () => {
    expect(PLANES).toEqual(['revendedor']);
  });

  it('todo plan existe como plantilla de verdad', () => {
    for (const plan of PLANES) {
      expect(ROLE_TEMPLATES.some((t) => t.key === plan)).toBe(true);
    }
  });
});

describe('que puede hacer la tienda con cada uno', () => {
  it('con un oficio, todo', () => {
    expect(puedeLaTiendaTocarlo({ templateKey: 'cajero' })).toEqual({
      permitido: true,
    });
  });

  it('con uno hecho a mano, todo', () => {
    expect(puedeLaTiendaTocarlo({ templateKey: null })).toEqual({
      permitido: true,
    });
  });

  it('con un plan, nada, y se dice por que', () => {
    const r = puedeLaTiendaTocarlo({ templateKey: 'revendedor' });
    expect(r.permitido).toBe(false);
    expect(r.porque).toMatch(/plan/i);
  });
});
