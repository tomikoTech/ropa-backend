import {
  explicarOtraBodega,
  faltaEnElLocal,
} from './venta-desde-otra-bodega.js';

const local = { warehouseId: 'local', nombre: 'Local', disponible: 0 };
const sucursal = { warehouseId: 'suc', nombre: 'Sucursal', disponible: 5 };

describe('faltaEnElLocal', () => {
  it('con existencia en el propio local no pregunta nada', () => {
    expect(
      faltaEnElLocal({
        bodegaDeLaVenta: 'local',
        pedido: 2,
        existencias: [{ ...local, disponible: 3 }, sucursal],
      }),
    ).toBeNull();
  });

  it('justo lo que hay tampoco pregunta', () => {
    expect(
      faltaEnElLocal({
        bodegaDeLaVenta: 'local',
        pedido: 3,
        existencias: [{ ...local, disponible: 3 }, sucursal],
      }),
    ).toBeNull();
  });

  it('el local en cero: dice cuántas faltan y de dónde saldrían', () => {
    // El caso comprobado: la venta se hizo en el Local y el par salió de la
    // Sucursal, sin decir nada.
    const falta = faltaEnElLocal({
      bodegaDeLaVenta: 'local',
      pedido: 1,
      existencias: [local, sucursal],
    });
    expect(falta).toEqual({
      faltan: 1,
      enElLocal: 0,
      otras: [{ nombre: 'Sucursal', disponible: 5 }],
    });
  });

  it('alcanza para parte: solo pregunta por lo que falta', () => {
    const falta = faltaEnElLocal({
      bodegaDeLaVenta: 'local',
      pedido: 5,
      existencias: [{ ...local, disponible: 2 }, sucursal],
    });
    expect(falta?.faltan).toBe(3);
    expect(falta?.enElLocal).toBe(2);
    // Y el propio local **no** aparece entre «las otras»: lo que tiene ya se
    // contó, y ofrecerlo como origen ajeno sería decir dos veces lo mismo.
    expect(falta?.otras.map((o) => o.nombre)).toEqual(['Sucursal']);
  });

  it('sin existencia en ninguna parte no hay nada que confirmar', () => {
    // Eso es un faltante de verdad y lo rechaza la validación de siempre;
    // preguntar sería ofrecer algo que no se puede hacer.
    expect(
      faltaEnElLocal({
        bodegaDeLaVenta: 'local',
        pedido: 2,
        existencias: [local, { ...sucursal, disponible: 0 }],
      }),
    ).toBeNull();
  });

  it('las otras bodegas van de mayor a menor: primero donde más hay', () => {
    const falta = faltaEnElLocal({
      bodegaDeLaVenta: 'local',
      pedido: 1,
      existencias: [
        local,
        { warehouseId: 'a', nombre: 'Chica', disponible: 1 },
        { warehouseId: 'b', nombre: 'Grande', disponible: 9 },
      ],
    });
    expect(falta?.otras.map((o) => o.nombre)).toEqual(['Grande', 'Chica']);
  });

  it('varias filas del mismo local se suman', () => {
    // Una variante puede tener más de una fila de stock en la misma bodega.
    expect(
      faltaEnElLocal({
        bodegaDeLaVenta: 'local',
        pedido: 4,
        existencias: [
          { ...local, disponible: 2 },
          { ...local, disponible: 2 },
          sucursal,
        ],
      }),
    ).toBeNull();
  });

  it('un saldo negativo del local no suma a favor', () => {
    // Los hay: el ledger permite negativos cuando una etiqueta no cuadra.
    const falta = faltaEnElLocal({
      bodegaDeLaVenta: 'local',
      pedido: 1,
      existencias: [{ ...local, disponible: -3 }, sucursal],
    });
    expect(falta?.faltan).toBe(1);
    expect(falta?.enElLocal).toBe(0);
  });

  it('pedir cero no pregunta', () => {
    expect(
      faltaEnElLocal({
        bodegaDeLaVenta: 'local',
        pedido: 0,
        existencias: [local, sucursal],
      }),
    ).toBeNull();
  });
});

describe('explicarOtraBodega', () => {
  it('dice qué pasa y qué se está confirmando', () => {
    const texto = explicarOtraBodega('Bota 40/Café', {
      faltan: 2,
      enElLocal: 0,
      otras: [{ nombre: 'Sucursal', disponible: 5 }],
    });
    expect(texto).toContain('Bota 40/Café');
    expect(texto).toContain('no queda ninguno en este local');
    expect(texto).toContain('Sucursal (5)');
    expect(texto).toMatch(/confirma/i);
  });

  it('cuando queda algo, lo dice en vez de decir que no hay', () => {
    const texto = explicarOtraBodega('Bota', {
      faltan: 3,
      enElLocal: 2,
      otras: [{ nombre: 'Sucursal', disponible: 9 }],
    });
    expect(texto).toContain('solo quedan 2');
    expect(texto).toContain('3 saldría(n)');
  });
});
