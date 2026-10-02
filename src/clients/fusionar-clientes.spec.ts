import {
  agruparDuplicados,
  claveDelNombre,
  planDeFusion,
} from './fusionar-clientes.js';

const ficha = (
  id: string,
  firstName: string,
  lastName: string,
  createdAt: string,
  extra = {},
) => ({
  id,
  firstName,
  lastName,
  createdAt,
  documentNumber: null,
  phone: null,
  email: null,
  address: null,
  ...extra,
});

describe('claveDelNombre', () => {
  it('ignora tildes, mayúsculas, espacios dobles y cómo se partió el nombre', () => {
    expect(claveDelNombre({ firstName: 'LILIA', lastName: 'PEÑALOSA' })).toBe(
      claveDelNombre({ firstName: 'Lilia  Peñalosa', lastName: '' }),
    );
    expect(claveDelNombre({ firstName: 'José Pérez', lastName: null })).toBe(
      'jose perez',
    );
  });
});

describe('agruparDuplicados', () => {
  it('junta las fichas con la misma clave y deja fuera las únicas', () => {
    const grupos = agruparDuplicados([
      ficha('a', 'LILIA', 'PEÑALOSA', '2026-07-03'),
      ficha('b', 'LILIA PEÑALOSA', '', '2026-08-03'),
      ficha('c', 'Fabio', 'Ríos', '2026-07-03'),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('una ficha sin nombre no se junta con otra sin nombre', () => {
    expect(
      agruparDuplicados([
        ficha('a', '', '', '2026-01-01'),
        ficha('b', '', '', '2026-01-02'),
      ]),
    ).toEqual([]);
  });
});

describe('planDeFusion', () => {
  it('sobrevive la más antigua y las demás la completan', () => {
    const plan = planDeFusion([
      ficha('nueva', 'LILIA PEÑALOSA', '', '2026-08-03', {
        phone: '3001234567',
      }),
      ficha('vieja', 'LILIA', 'PEÑALOSA', '2026-07-03'),
    ]);
    expect(plan.sobrevive.id).toBe('vieja');
    expect(plan.absorbidos.map((a) => a.id)).toEqual(['nueva']);
    expect(plan.completar).toEqual({ phone: '3001234567' });
  });

  it('no pisa lo que el sobreviviente ya tiene', () => {
    const plan = planDeFusion([
      ficha('vieja', 'A', 'B', '2026-01-01', { phone: '111' }),
      ficha('nueva', 'A B', '', '2026-02-01', {
        phone: '222',
        address: 'Calle 1',
      }),
    ]);
    expect(plan.completar).toEqual({ address: 'Calle 1' });
  });

  it('con una sola ficha no hay fusión', () => {
    expect(() => planDeFusion([ficha('a', 'A', 'B', '2026-01-01')])).toThrow();
  });
});
