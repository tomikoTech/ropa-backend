import {
  compararTallas,
  esParaElPublico,
  esTallaUnica,
  filtrosDelCatalogo,
  productoDelCatalogo,
  sinCostos,
} from './catalogo.js';

const fuente = {
  id: 'p1',
  slug: 'runner-negro',
  name: 'Runner',
  displayName: '',
  brand: ' Nike ',
  gender: 'HOMBRE',
  description: null,
  basePrice: '189900.00',
  costPrice: 90000,
  wholesalePrice: 120000,
  minimumSalePrice: 150000,
  imageUrl: 'https://r2/a.jpg',
  imageUrls: ['https://r2/b.jpg', 'https://r2/a.jpg'],
  isAvailable: true,
  category: { name: 'Tenis' },
  variants: [
    { id: 'v40', sizeName: '40', colorName: 'Negro', stock: 2, isActive: true },
    { id: 'v41', sizeName: '41', colorName: 'Negro', stock: 0, isActive: true },
    { id: 'v38', sizeName: '38', colorName: 'Negro', stock: 5, isActive: true, priceOverride: '159900' },
    { id: 'vx', sizeName: '39', colorName: 'Negro', stock: 9, isActive: false },
  ],
};

describe('catálogo público: qué sale de un producto', () => {
  const p = productoDelCatalogo(fuente);

  it('el costo y el mayorista no viajan; el precio es el de venta al detal', () => {
    expect(JSON.stringify(p)).not.toMatch(/90000|120000|150000|costPrice|wholesale/);
    expect(p.precio).toBe(189900);
  });

  it('de la existencia solo se dice disponible o agotado, nunca cuántos', () => {
    expect(JSON.stringify(p)).not.toMatch(/stock|quantity/);
    expect(p.tallas.map((t) => [t.talla, t.disponible])).toEqual([
      ['38', true],
      ['40', true],
      ['41', false],
    ]);
  });

  it('las tallas inactivas no aparecen y las demás van en orden natural', () => {
    expect(p.tallas.map((t) => t.talla)).toEqual(['38', '40', '41']);
  });

  it('una talla con precio propio lo dice; las demás no repiten el del producto', () => {
    expect(p.tallas.find((t) => t.talla === '38')?.precio).toBe(159900);
    expect(p.tallas.find((t) => t.talla === '40')?.precio).toBeUndefined();
  });

  it('las fotos se juntan sin repetir y la marca sale limpia', () => {
    expect(p.fotos).toEqual(['https://r2/b.jpg', 'https://r2/a.jpg']);
    expect(p.marca).toBe('Nike');
    expect(p.nombre).toBe('Runner');
  });

  it('una referencia marcada agotada por la tienda sale agotada aunque tenga pares', () => {
    expect(productoDelCatalogo({ ...fuente, isAvailable: false }).disponible).toBe(false);
    expect(productoDelCatalogo(fuente).disponible).toBe(true);
    expect(
      productoDelCatalogo({
        ...fuente,
        variants: fuente.variants.map((v) => ({ ...v, stock: 0 })),
      }).disponible,
    ).toBe(false);
  });
});

describe('catálogo público: filtros y tallas', () => {
  it('ordena tallas numéricas por número y las de letra después', () => {
    expect(['M', '40', '38', 'S', '42.5'].sort(compararTallas)).toEqual(['38', '40', '42.5', 'M', 'S']);
  });

  it('los filtros salen de lo que hay', () => {
    const otro = productoDelCatalogo({
      ...fuente,
      id: 'p2',
      brand: 'Adidas',
      gender: 'MUJER',
      variants: [{ id: 'v36', sizeName: '36', colorName: 'Blanco', stock: 1 }],
    });
    expect(filtrosDelCatalogo([productoDelCatalogo(fuente), otro])).toEqual({
      marcas: ['Adidas', 'Nike'],
      tallas: ['36', '38', '40', '41'],
      generos: ['HOMBRE', 'MUJER'],
    });
  });
});

describe('tienda en línea: el costo no sale por el endpoint público', () => {
  it('quita costo, mayorista y mínimo y deja el resto', () => {
    const limpio = sinCostos(fuente);
    expect(limpio).not.toHaveProperty('costPrice');
    expect(limpio).not.toHaveProperty('wholesalePrice');
    expect(limpio).not.toHaveProperty('minimumSalePrice');
    expect(limpio.basePrice).toBe('189900.00');
  });
});

describe('catálogo público: la materia prima no sale', () => {
  it('esencias y frascos no son para el público; lociones y zapatos sí', () => {
    expect(esParaElPublico({ category: { type: 'ESSENCE' } })).toBe(false);
    expect(esParaElPublico({ category: { type: 'FRASCO' } })).toBe(false);
    expect(esParaElPublico({ category: { type: 'STANDARD' } })).toBe(true);
    expect(esParaElPublico({ category: null })).toBe(true);
    expect(esParaElPublico({})).toBe(true);
  });
});

describe('catálogo público: lo que no viene por tallas', () => {
  it('«Única», «U» o vacío es talla única; «40» no', () => {
    for (const t of ['Única', 'unica', 'U', '', ' ', 'Unitalla']) expect(esTallaUnica(t)).toBe(true);
    expect(esTallaUnica('40')).toBe(false);
    expect(esTallaUnica('M')).toBe(false);
  });

  it('la talla única no aparece como filtro', () => {
    const perfume = productoDelCatalogo({
      ...fuente,
      id: 'p3',
      variants: [{ id: 'vu', sizeName: 'Única', colorName: 'Único', stock: 4 }],
    });
    expect(filtrosDelCatalogo([perfume]).tallas).toEqual([]);
  });
});
