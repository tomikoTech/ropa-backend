import { ProductVariant } from './product-variant.entity.js';
import { Size } from '../../catalogs/entities/size.entity.js';
import { Color } from '../../catalogs/entities/color.entity.js';

function makeVariant(sizeName?: string, colorName?: string): ProductVariant {
  const v = new ProductVariant();
  v.id = 'v1';
  v.sku = 'SKU-1';
  if (sizeName) {
    const s = new Size();
    s.name = sizeName;
    v.sizeRef = s;
  }
  if (colorName) {
    const c = new Color();
    c.name = colorName;
    v.colorRef = c;
  }
  // TypeORM lo invoca al leer de la base; aquí se simula esa carga.
  v.hydrateCatalogNames();
  return v;
}

describe('ProductVariant', () => {
  describe('sizeName / colorName', () => {
    it('devuelve el nombre desde el catálogo', () => {
      const v = makeVariant('38', 'Negro');
      expect(v.sizeName).toBe('38');
      expect(v.colorName).toBe('Negro');
    });

    it('devuelve cadena vacía cuando la variante no tiene talla ni color', () => {
      const v = makeVariant();
      expect(v.sizeName).toBe('');
      expect(v.colorName).toBe('');
    });
  });

  describe('serialización a JSON (contrato de la API)', () => {
    // Regresión: al pasar talla y color a FK se expusieron como getters, que
    // viven en el prototipo y no son enumerables: JSON.stringify los omitía y
    // la API devolvía las variantes SIN talla ni color. Por eso son
    // propiedades reales rellenadas en @AfterLoad.
    it('incluye size y color como texto en el JSON de la API', () => {
      const json = JSON.parse(JSON.stringify(makeVariant('38', 'Negro'))) as {
        size: string;
        color: string;
      };
      expect(json.size).toBe('38');
      expect(json.color).toBe('Negro');
    });

    it('incluye size y color vacíos cuando no hay catálogo asociado', () => {
      const json = JSON.parse(JSON.stringify(makeVariant())) as {
        size: string;
        color: string;
      };
      expect(json.size).toBe('');
      expect(json.color).toBe('');
    });

    it('conserva el resto de campos de la variante', () => {
      const json = JSON.parse(JSON.stringify(makeVariant('38', 'Negro'))) as {
        id: string;
        sku: string;
      };
      expect(json.id).toBe('v1');
      expect(json.sku).toBe('SKU-1');
    });

    // Un arreglo de variantes es como viajan realmente dentro de un producto.
    it('funciona al serializar una lista de variantes', () => {
      const json = JSON.parse(
        JSON.stringify([makeVariant('38', 'Negro'), makeVariant('39', 'Azul')]),
      ) as { size: string }[];
      expect(json.map((v) => v.size)).toEqual(['38', '39']);
    });
  });
});
