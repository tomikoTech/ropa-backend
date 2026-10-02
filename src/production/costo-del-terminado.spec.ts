import {
  costoDelTerminado,
  desgloseDelCosto,
  gananciaPorUnidad,
} from './costo-del-terminado.js';

describe('costoDelTerminado', () => {
  it('el ejemplo de Jefferson: 30 + 7 + 7 = 44, y con 60 menos 15 % se ganan 7', () => {
    const c = costoDelTerminado({
      costoDelFrasco: 30_000,
      esenciaFijaPorUnidad: 7_000,
      manoDeObraGeneral: 7_000,
    });
    expect(c.total).toBe(44_000);
    expect(c.avisos).toEqual([]);
    expect(gananciaPorUnidad(60_000 * 0.85, c)).toBe(7_000);
    expect(desgloseDelCosto(c)).toBe(
      'Frasco $30.000 + esencia $7.000 + mano de obra $7.000 = $44.000',
    );
  });

  it('la mano de obra del producto manda sobre la general', () => {
    const c = costoDelTerminado({
      costoDelFrasco: 30_000,
      esenciaFijaPorUnidad: 7_000,
      manoDeObraGeneral: 7_000,
      manoDeObraDelProducto: 10_000,
    });
    expect(c.manoDeObra).toBe(10_000);
    expect(c.total).toBe(47_000);
    // Cero puesto a propósito también manda: «esta no lleva mano de obra».
    expect(
      costoDelTerminado({
        costoDelFrasco: 1,
        esenciaFijaPorUnidad: 1,
        manoDeObraGeneral: 7_000,
        manoDeObraDelProducto: 0,
      }).manoDeObra,
    ).toBe(0);
  });

  it('sin costo de frasco o sin esencia configurada, el costo sale pero avisa', () => {
    const c = costoDelTerminado({
      costoDelFrasco: null,
      esenciaFijaPorUnidad: 0,
      manoDeObraGeneral: 7_000,
    });
    expect(c.total).toBe(7_000);
    expect(c.avisos).toHaveLength(2);
    expect(c.avisos[0]).toContain('frasco');
    expect(c.avisos[1]).toContain('esencia');
  });

  it('los decimales y los negativos no entran', () => {
    const c = costoDelTerminado({
      costoDelFrasco: 29_999.6,
      esenciaFijaPorUnidad: -5,
      manoDeObraGeneral: 7_000.4,
    });
    expect(c.frasco).toBe(30_000);
    expect(c.esencia).toBe(0);
    expect(c.manoDeObra).toBe(7_000);
  });
});
