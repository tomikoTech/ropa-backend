import { repartirPorBodega } from './reparto-de-unidades.js';

/**
 * Cuando la edición de una factura dice **cuáles** pares se lleva.
 *
 * Al editar una venta, el servidor revierte todo y vuelve a aplicar. Si nadie
 * dice qué pares tomar, el inventario los elige por antigüedad — y ahí está el
 * problema que reportó el dueño: el cliente devuelve **uno** de los dos pares
 * que compró, se baja la cantidad de dos a uno, y el par que queda registrado
 * como vendido **no es el que el cliente se llevó**. El código impreso en la
 * caja que sigue en su casa figura como devuelto.
 *
 * El descuento va bodega por bodega —`ledger.mover` recibe una sola—, así que
 * los pares elegidos hay que agruparlos por dónde están. Y puede que no
 * alcancen para toda la línea: el resto sale de la cascada de siempre.
 */

const u = (id: string, warehouseId: string) => ({ id, warehouseId });

describe('repartirPorBodega', () => {
  it('agrupa los pares elegidos por su bodega', () => {
    expect(
      repartirPorBodega([u('a', 'local'), u('b', 'vitrina'), u('c', 'local')], 3),
    ).toEqual({
      porBodega: [
        { warehouseId: 'local', unidades: ['a', 'c'], cantidad: 2 },
        { warehouseId: 'vitrina', unidades: ['b'], cantidad: 1 },
      ],
      faltan: 0,
    });
  });

  it('el orden no cambia entre corridas', () => {
    // Dos ediciones iguales tienen que mover las mismas bodegas en el mismo
    // orden, o un descuadre deja de ser reproducible.
    const { porBodega } = repartirPorBodega(
      [u('a', 'zeta'), u('b', 'alfa')],
      2,
    );
    expect(porBodega.map((b) => b.warehouseId)).toEqual(['alfa', 'zeta']);
  });

  it('no toma más pares que la cantidad de la línea', () => {
    // Si sobran ids —de una edición anterior— descontaría de más y la factura
    // diría dos donde el inventario movió tres.
    expect(repartirPorBodega([u('a', 'x'), u('b', 'x'), u('c', 'x')], 2)).toEqual(
      {
        porBodega: [{ warehouseId: 'x', unidades: ['a', 'b'], cantidad: 2 }],
        faltan: 0,
      },
    );
  });

  it('dice cuántos faltan cuando los elegidos no alcanzan', () => {
    // Se puede elegir un par y dejar que el resto salga de la cascada.
    expect(repartirPorBodega([u('a', 'x')], 3)).toEqual({
      porBodega: [{ warehouseId: 'x', unidades: ['a'], cantidad: 1 }],
      faltan: 2,
    });
  });

  it('sin pares elegidos, todo sale de la cascada', () => {
    // Es el camino de siempre: quien no elige, no cambia de comportamiento.
    expect(repartirPorBodega([], 2)).toEqual({ porBodega: [], faltan: 2 });
  });

  it('un par repetido se toma una sola vez', () => {
    // El mismo bulto no se puede descontar dos veces; contarlo doble dejaría
    // la línea corta sin que nadie se entere.
    expect(repartirPorBodega([u('a', 'x'), u('a', 'x')], 2)).toEqual({
      porBodega: [{ warehouseId: 'x', unidades: ['a'], cantidad: 1 }],
      faltan: 1,
    });
  });

  it('cantidad cero no mueve nada', () => {
    expect(repartirPorBodega([u('a', 'x')], 0)).toEqual({
      porBodega: [],
      faltan: 0,
    });
  });

  it('no modifica la lista que recibe', () => {
    const original = [u('b', 'zeta'), u('a', 'alfa')];
    repartirPorBodega(original, 2);
    expect(original.map((x) => x.id)).toEqual(['b', 'a']);
  });

  describe('una caja vale lo que trae, no uno', () => {
    const caja = (id: string, warehouseId: string, unidades: number) => ({
      id,
      warehouseId,
      unidades,
    });

    it('una caja de 24 cubre las 24 de la línea, no una', () => {
      // El bug que descuadró una tienda: se contaba como 1, «faltaban 23», y
      // esas 23 salían además por la cascada. Cada edición se comía 24.
      expect(repartirPorBodega([caja('c1', 'x', 24)], 24)).toEqual({
        porBodega: [{ warehouseId: 'x', unidades: ['c1'], cantidad: 24 }],
        faltan: 0,
      });
    });

    it('dos cajas de 24 cubren 48', () => {
      expect(
        repartirPorBodega([caja('c1', 'x', 24), caja('c2', 'x', 24)], 48),
      ).toEqual({
        porBodega: [{ warehouseId: 'x', unidades: ['c1', 'c2'], cantidad: 48 }],
        faltan: 0,
      });
    });

    it('una caja NO se parte: si no cabe en lo que falta, no se toma', () => {
      // Descontar 24 para cubrir 10 es peor que dejar que la cascada saque 10.
      expect(repartirPorBodega([caja('c1', 'x', 24)], 10)).toEqual({
        porBodega: [],
        faltan: 10,
      });
    });

    it('se mezclan cajas y pares sueltos', () => {
      expect(
        repartirPorBodega([caja('c1', 'x', 24), caja('p1', 'x', 1)], 25),
      ).toEqual({
        porBodega: [{ warehouseId: 'x', unidades: ['c1', 'p1'], cantidad: 25 }],
        faltan: 0,
      });
    });

    it('lo que la caja no cubre lo dice, para que salga de la cascada', () => {
      expect(repartirPorBodega([caja('c1', 'x', 24)], 30)).toEqual({
        porBodega: [{ warehouseId: 'x', unidades: ['c1'], cantidad: 24 }],
        faltan: 6,
      });
    });

    it('cajas en bodegas distintas se agrupan con su propia suma', () => {
      expect(
        repartirPorBodega([caja('c1', 'local', 24), caja('c2', 'vitrina', 12)], 36),
      ).toEqual({
        porBodega: [
          { warehouseId: 'local', unidades: ['c1'], cantidad: 24 },
          { warehouseId: 'vitrina', unidades: ['c2'], cantidad: 12 },
        ],
        faltan: 0,
      });
    });

    it('sin decir cuánto trae, vale uno: es lo que era antes de las cajas', () => {
      expect(repartirPorBodega([u('a', 'x')], 1)).toEqual({
        porBodega: [{ warehouseId: 'x', unidades: ['a'], cantidad: 1 }],
        faltan: 0,
      });
    });
  });
});
