import {
  elegirClienteDelPedido,
  mismoTelefono,
  primerNombre,
  telefonoComparable,
} from './cliente-del-pedido.js';

const cliente = (
  id: string,
  nombre: string,
  apellido: string,
  phone: string | null,
  createdAt = '2026-07-03',
) => ({ id, firstName: nombre, lastName: apellido, phone, createdAt });

// El caso real: el Miller de siempre vino de la carga inicial sin teléfono.
const millerDeSiempre = cliente('m1', 'Miller', 'Gomez', null);

describe('teléfono comparable', () => {
  it('con indicativo, espacios o guiones es el mismo número', () => {
    expect(telefonoComparable('+57 320 749 9137')).toBe('3207499137');
    expect(mismoTelefono('320-749-9137', '573207499137')).toBe(true);
  });

  it('un número vacío o de pocos dígitos no casa con nada', () => {
    expect(mismoTelefono('', '')).toBe(false);
    expect(mismoTelefono('123', '123')).toBe(false);
  });
});

describe('a quién se le factura el pedido', () => {
  it('por teléfono, aunque escriba solo el primer nombre', () => {
    const conTelefono = cliente('m1', 'Miller', 'Gomez', '3207499137');
    const r = elegirClienteDelPedido(
      { nombre: 'Miller', telefono: '+57 3207499137' },
      [conTelefono],
    );
    expect(r.cliente?.id).toBe('m1');
    expect(r.motivo).toBe('telefono');
  });

  it('con dos fichas del mismo teléfono, la más antigua', () => {
    const r = elegirClienteDelPedido(
      { nombre: 'Diana', telefono: '3188200164' },
      [
        cliente('nueva', 'Diana', 'Gómez', '3188200164', '2026-10-14'),
        cliente('vieja', 'Diana', 'Gomez', '318 820 0164', '2026-07-03'),
      ],
    );
    expect(r.cliente?.id).toBe('vieja');
  });

  it('por nombre completo cuando la ficha no tiene teléfono', () => {
    const r = elegirClienteDelPedido(
      { nombre: 'Miller Gómez', telefono: '3207499137' },
      [millerDeSiempre],
    );
    expect(r.cliente?.id).toBe('m1');
    expect(r.motivo).toBe('nombre');
  });

  it('un homónimo con otro teléfono no se toma solo: puede ser otra persona', () => {
    const r = elegirClienteDelPedido(
      { nombre: 'Miller Gómez', telefono: '3207499137' },
      [cliente('otro', 'Miller', 'Gomez', '3001112233')],
    );
    expect(r.cliente).toBeNull();
    expect(r.parecidos.map((c) => c.id)).toEqual(['otro']);
  });

  it('dos homónimos sin teléfono: no se adivina', () => {
    const r = elegirClienteDelPedido(
      { nombre: 'Miller Gomez', telefono: null },
      [millerDeSiempre, cliente('m2', 'MILLER', 'GÓMEZ', null)],
    );
    expect(r.cliente).toBeNull();
    expect(r.parecidos).toHaveLength(2);
  });

  it('«Miller» solo no se decide: se sugiere el Miller de siempre', () => {
    const r = elegirClienteDelPedido(
      { nombre: 'Miller', telefono: '3207499137' },
      [millerDeSiempre, cliente('x', 'Jhon', 'Muñoz', '3228794317')],
    );
    expect(r.cliente).toBeNull();
    expect(r.parecidos.map((c) => c.id)).toEqual(['m1']);
  });

  it('lo elegido no se repite entre los parecidos', () => {
    const r = elegirClienteDelPedido(
      { nombre: 'Miller', telefono: '3207499137' },
      [
        millerDeSiempre,
        cliente('m3', 'Miller', 'Gómez', '3207499137', '2026-10-08'),
      ],
    );
    expect(r.cliente?.id).toBe('m3');
    expect(r.parecidos.map((c) => c.id)).toEqual(['m1']);
  });

  it('el primer nombre ignora tildes y mayúsculas', () => {
    expect(primerNombre('  ÁNGELA maría')).toBe('angela');
  });
});
