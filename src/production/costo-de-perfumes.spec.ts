import { costoDelPerfume, precioConDescuento } from './costo-de-perfumes.js';

describe('costoDelPerfume', () => {
  const jefferson = {
    precioDeVenta: 60_000,
    costoDelFrasco: 30_000,
    esenciaFijaPorUnidad: 7_000,
    manoDeObraGeneral: 7_000,
  };

  it('el ejemplo de Jefferson: cuesta 44.000, de lista gana 16.000 y con 15 % gana 7.000', () => {
    const c = costoDelPerfume(jefferson, [10, 15, 20, 30]);
    expect(c.total).toBe(44_000);
    expect(c.utilidad).toBe(16_000);
    expect(c.conDescuento).toEqual([
      { porcentaje: 10, precio: 54_000, utilidad: 10_000 },
      { porcentaje: 15, precio: 51_000, utilidad: 7_000 },
      { porcentaje: 20, precio: 48_000, utilidad: 4_000 },
      { porcentaje: 30, precio: 42_000, utilidad: -2_000 },
    ]);
  });

  it('una utilidad negativa se enseña, no se recorta a cero: para eso es la página', () => {
    const c = costoDelPerfume({ ...jefferson, precioDeVenta: 40_000 }, [30]);
    expect(c.utilidad).toBe(-4_000);
    expect(c.conDescuento[0].utilidad).toBe(-16_000);
  });

  it('la mano de obra del producto manda sobre la general, igual que al producir', () => {
    const c = costoDelPerfume(
      { ...jefferson, manoDeObraDelProducto: 5_000 },
      [],
    );
    expect(c.manoDeObra).toBe(5_000);
    expect(c.total).toBe(42_000);
    expect(c.conDescuento).toEqual([]);
  });

  it('sin frasco el costo sigue saliendo, con su aviso', () => {
    const c = costoDelPerfume({ ...jefferson, costoDelFrasco: null }, [10]);
    expect(c.frasco).toBe(0);
    expect(c.total).toBe(14_000);
    expect(c.avisos[0]).toMatch(/frasco/i);
  });

  it('presets repetidos, en cero o inválidos no generan columnas', () => {
    const c = costoDelPerfume(jefferson, [15, 15, 0, 150, Number.NaN]);
    expect(c.conDescuento.map((d) => d.porcentaje)).toEqual([15]);
  });

  it('redondea al peso, como cobra el POS', () => {
    expect(precioConDescuento(42_500, 15)).toBe(36_125);
    expect(precioConDescuento(55_555, 10)).toBe(50_000);
    expect(precioConDescuento(-5, 10)).toBe(0);
  });
});
