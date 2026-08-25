import {
  alcanzaElInventario,
  loQueSaca,
} from './alcanza-el-inventario.js';

describe('alcanzaElInventario', () => {
  describe('lo normal', () => {
    it('deja sacar lo que hay', () => {
      expect(alcanzaElInventario({ antes: 10, despues: 6 })).toEqual({
        permitido: true,
      });
    });

    it('deja sacar hasta dejarlo en cero', () => {
      expect(alcanzaElInventario({ antes: 4, despues: 0 })).toEqual({
        permitido: true,
      });
    });

    it('frena lo que no hay, y dice cuánto hay y cuánto se pedía', () => {
      const v = alcanzaElInventario({ antes: 5, despues: -1 });
      expect(v.permitido).toBe(false);
      expect(v.permitido === false && v.porque).toBe(
        'No hay suficiente inventario: hay 5 y se intentan sacar 6.',
      );
    });

    it('deja entrar mercancía', () => {
      expect(alcanzaElInventario({ antes: 0, despues: 5 })).toEqual({
        permitido: true,
      });
    });
  });

  describe('cuando el saldo ya venía negativo', () => {
    // Esto es lo que rompía en Distri Amber: el frasco en -17 y una venta a
    // crédito que ya no se podía anular.
    it('deja devolver aunque el saldo siga en rojo', () => {
      expect(alcanzaElInventario({ antes: -17, despues: -13 })).toEqual({
        permitido: true,
      });
    });

    it('deja devolver hasta sacarlo del rojo', () => {
      expect(alcanzaElInventario({ antes: -17, despues: 3 })).toEqual({
        permitido: true,
      });
    });

    it('pero no deja sacar más de un saldo que ya debe', () => {
      const v = alcanzaElInventario({ antes: -17, despues: -21 });
      expect(v.permitido).toBe(false);
      expect(v.permitido === false && v.porque).toBe(
        'No hay suficiente inventario: hay -17 y se intentan sacar 4.',
      );
    });

    it('un movimiento que no cambia nada nunca se frena', () => {
      expect(alcanzaElInventario({ antes: -17, despues: -17 })).toEqual({
        permitido: true,
      });
    });
  });

  describe('cuando quien mueve acepta dejarlo debiendo', () => {
    // El frasco de la loción y el par escaneado en otra bodega: el negativo es
    // el aviso, no el error.
    it('deja el saldo en rojo', () => {
      expect(
        alcanzaElInventario({
          antes: 2,
          despues: -15,
          permitirNegativo: true,
        }),
      ).toEqual({ permitido: true });
    });

    it('y lo deja más rojo todavía', () => {
      expect(
        alcanzaElInventario({
          antes: -17,
          despues: -21,
          permitirNegativo: true,
        }),
      ).toEqual({ permitido: true });
    });
  });

  describe('loQueSaca', () => {
    it('es lo que baja el saldo', () => {
      expect(loQueSaca({ antes: 10, despues: 6 })).toBe(4);
    });

    it('cuenta lo que baja aunque termine en negativo', () => {
      expect(loQueSaca({ antes: 5, despues: -1 })).toBe(6);
    });

    it('es cero cuando entra mercancía', () => {
      expect(loQueSaca({ antes: -17, despues: -13 })).toBe(0);
    });

    it('es cero cuando no se mueve nada', () => {
      expect(loQueSaca({ antes: 3, despues: 3 })).toBe(0);
    });
  });
});
