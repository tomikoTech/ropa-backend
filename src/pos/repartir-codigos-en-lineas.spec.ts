import {
  tomarParaLaLinea,
  type CodigoDisponible,
} from './repartir-codigos-en-lineas.js';

const caja = (barcode: string, unidades = 24): CodigoDisponible => ({
  barcode,
  unidades,
});

describe('repartir los códigos entre las líneas de la factura', () => {
  it('una línea de 24 se lleva UNA caja de 24, no veinticuatro cajas', () => {
    // El error real: `splice(0, 24)` sobre una lista de cajas se llevaba las
    // cuatro y dejaba a las otras tres líneas sin ninguna.
    const disponibles = [caja('A'), caja('B'), caja('C'), caja('D')];
    expect(tomarParaLaLinea(disponibles, 24)).toEqual(['A']);
    expect(disponibles.map((c) => c.barcode)).toEqual(['B', 'C', 'D']);
  });

  it('cuatro líneas de 24 reciben una caja cada una', () => {
    const disponibles = [caja('A'), caja('B'), caja('C'), caja('D')];
    const reparto = [24, 24, 24, 24].map((n) =>
      tomarParaLaLinea(disponibles, n),
    );
    expect(reparto).toEqual([['A'], ['B'], ['C'], ['D']]);
    expect(disponibles).toHaveLength(0);
  });

  it('una línea de 48 se lleva dos cajas', () => {
    const disponibles = [caja('A'), caja('B'), caja('C')];
    expect(tomarParaLaLinea(disponibles, 48)).toEqual(['A', 'B']);
  });

  it('no parte una caja para cubrir de a poquitos', () => {
    // Doce pares no salen de una caja de 24: esa caja es de otro renglón.
    const disponibles = [caja('A'), caja('B', 12)];
    expect(tomarParaLaLinea(disponibles, 12)).toEqual(['B']);
    expect(disponibles.map((c) => c.barcode)).toEqual(['A']);
  });

  it('con pares sueltos reparte uno por unidad', () => {
    const disponibles = [caja('p1', 1), caja('p2', 1), caja('p3', 1)];
    expect(tomarParaLaLinea(disponibles, 2)).toEqual(['p1', 'p2']);
    expect(disponibles.map((c) => c.barcode)).toEqual(['p3']);
  });

  it('mezcla cajas y pares sin pasarse', () => {
    const disponibles = [caja('caja', 24), caja('p1', 1), caja('p2', 1)];
    expect(tomarParaLaLinea(disponibles, 2)).toEqual(['p1', 'p2']);
  });

  it('si no alcanza, entrega lo que hay', () => {
    const disponibles = [caja('A')];
    expect(tomarParaLaLinea(disponibles, 96)).toEqual(['A']);
    expect(disponibles).toHaveLength(0);
  });

  it('una cantidad de cero no se lleva nada', () => {
    const disponibles = [caja('A')];
    expect(tomarParaLaLinea(disponibles, 0)).toEqual([]);
    expect(disponibles).toHaveLength(1);
  });

  it('un código sin cantidad conocida cuenta como uno', () => {
    const disponibles: CodigoDisponible[] = [{ barcode: 'X', unidades: 0 }];
    expect(tomarParaLaLinea(disponibles, 1)).toEqual(['X']);
  });
});
