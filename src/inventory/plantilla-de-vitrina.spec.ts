import { accionDelHueco, huecosDeLaPlantilla, type FilaDeLaPlantilla } from './plantilla-de-vitrina.js';

const fila = (x: Partial<FilaDeLaPlantilla>): FilaDeLaPlantilla => ({
  vitrinaId: 'V',
  vitrinaNombre: 'Vitrina LOCAL 214',
  localId: 'L',
  localNombre: 'LOCAL 214',
  productId: 'p',
  productNombre: 'Producto',
  referencia: null,
  imageUrl: null,
  enVitrina: 0,
  enLocal: 0,
  enOtras: [],
  vendidasDeLaVitrina: 0,
  ultimaMuestra: null,
  bultosEnVitrina: [],
  ...x,
});

describe('la plantilla de la vitrina', () => {
  it('con pares en el local, se repone; sin pares ahí pero sí en otra bodega, se solicita', () => {
    expect(accionDelHueco({ enLocal: 2, enOtras: [] })).toBe('reponer');
    expect(accionDelHueco({ enLocal: 0, enOtras: [{ bodegaId: 'A', bodega: 'AMAWAD', cantidad: 5 }] })).toBe('solicitar');
    expect(accionDelHueco({ enLocal: 0, enOtras: [{ bodegaId: 'A', bodega: 'AMAWAD', cantidad: 0 }] })).toBe('sin-existencia');
  });

  it('solo los puestos vacíos son huecos', () => {
    const huecos = huecosDeLaPlantilla([
      fila({ productId: 'lleno', enVitrina: 1 }),
      fila({ productId: 'vacio', enLocal: 1 }),
    ]);
    expect(huecos.map((h) => h.productId)).toEqual(['vacio']);
  });

  it('primero lo que se repone ya, luego lo que se pide, y lo más vendido antes', () => {
    const huecos = huecosDeLaPlantilla([
      fila({ productId: 'sin', productNombre: 'Sin nada' }),
      fila({ productId: 'pedir', productNombre: 'Pedir', enOtras: [{ bodegaId: 'A', bodega: 'AMAWAD', cantidad: 3 }, { bodegaId: 'B', bodega: 'BODEGA B', cantidad: 9 }] }),
      fila({ productId: 'rep1', productNombre: 'Reponer uno', enLocal: 2, vendidasDeLaVitrina: 1 }),
      fila({ productId: 'rep5', productNombre: 'Reponer cinco', enLocal: 1, vendidasDeLaVitrina: 5 }),
    ]);
    expect(huecos.map((h) => h.productId)).toEqual(['rep5', 'rep1', 'pedir', 'sin']);
    // Se pide a la que más tiene.
    expect(huecos.find((h) => h.productId === 'pedir')?.pedirA?.bodega).toBe('BODEGA B');
    expect(huecos.find((h) => h.productId === 'sin')?.pedirA).toBeNull();
  });
});
