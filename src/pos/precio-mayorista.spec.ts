import {
  mayoreoPorReferencia,
  precioDelRenglon,
  type RenglonParaMayoreo,
} from './precio-mayorista.js';

const par = (
  productId: string,
  cantidad: number,
  extra: Partial<RenglonParaMayoreo> = {},
): RenglonParaMayoreo => ({
  productId,
  cantidad,
  precioMayorista: 50000,
  ...extra,
});

describe('mayoreoPorReferencia', () => {
  it('doce pares del mismo modelo, en tallas distintas, llegan al umbral', () => {
    // El caso que motivó todo: la caja se abrió y se venden los doce pares.
    const mayoreo = mayoreoPorReferencia(
      [par('tenis', 5), par('tenis', 4), par('tenis', 3)],
      12,
    );
    expect(mayoreo.get('tenis')?.aplica).toBe(true);
    expect(mayoreo.get('tenis')?.unidadesDeLaReferencia).toBe(12);
  });

  it('doce pares de modelos distintos NO son mayoreo', () => {
    // Un cliente surtiéndose no es un mayorista.
    const renglones = Array.from({ length: 12 }, (_, i) =>
      par(`modelo-${i}`, 1),
    );
    const mayoreo = mayoreoPorReferencia(renglones, 12);
    for (const decision of mayoreo.values()) {
      expect(decision.aplica).toBe(false);
    }
  });

  it('justo en el umbral ya cuenta', () => {
    expect(mayoreoPorReferencia([par('a', 6)], 6).get('a')?.aplica).toBe(true);
    expect(mayoreoPorReferencia([par('a', 5)], 6).get('a')?.aplica).toBe(false);
  });

  it('apagado por defecto: en cero nada cambia', () => {
    // Es como nace una tienda, y es como funcionaba antes.
    for (const umbral of [0, null, undefined]) {
      expect(mayoreoPorReferencia([par('a', 100)], umbral).get('a')?.aplica).toBe(
        false,
      );
    }
  });

  it('un umbral negativo no enciende nada', () => {
    expect(mayoreoPorReferencia([par('a', 100)], -3).get('a')?.aplica).toBe(
      false,
    );
  });

  it('sin precio mayorista cargado no hay a qué bajar', () => {
    const mayoreo = mayoreoPorReferencia(
      [par('a', 20, { precioMayorista: 0 })],
      6,
    );
    expect(mayoreo.get('a')?.aplica).toBe(false);
    // Pero el conteo se informa igual: la pantalla dice cuántas van.
    expect(mayoreo.get('a')?.unidadesDeLaReferencia).toBe(20);
  });

  it('el precio cargado en un renglón vale para toda la referencia', () => {
    // Dos renglones de la misma referencia; uno trae el precio y el otro no,
    // porque vienen de caminos distintos del carrito.
    const mayoreo = mayoreoPorReferencia(
      [par('a', 3), par('a', 3, { precioMayorista: null })],
      6,
    );
    expect(mayoreo.get('a')?.aplica).toBe(true);
  });

  it('las cantidades absurdas no inflan el conteo', () => {
    expect(
      mayoreoPorReferencia([par('a', -50), par('a', 6)], 6).get('a')
        ?.unidadesDeLaReferencia,
    ).toBe(6);
  });

  it('un renglón sin referencia no entra en ningún grupo', () => {
    const mayoreo = mayoreoPorReferencia([par('', 20), par('a', 2)], 6);
    expect(mayoreo.has('')).toBe(false);
    expect(mayoreo.get('a')?.aplica).toBe(false);
  });
});

describe('precioDelRenglon', () => {
  it('con mayoreo cobra el precio al por mayor', () => {
    const renglon = par('a', 12);
    const mayoreo = mayoreoPorReferencia([renglon], 12);
    expect(precioDelRenglon(renglon, 80000, mayoreo)).toBe(50000);
  });

  it('sin mayoreo deja el precio que traía', () => {
    const renglon = par('a', 2);
    const mayoreo = mayoreoPorReferencia([renglon], 12);
    expect(precioDelRenglon(renglon, 80000, mayoreo)).toBe(80000);
  });

  it('el mayoreo nunca sube el precio', () => {
    // Un producto con el mayorista mal cargado —por encima del de lista— no
    // puede terminar cobrándole de más al cliente que más compra.
    const renglon = par('a', 12, { precioMayorista: 120000 });
    const mayoreo = mayoreoPorReferencia([renglon], 12);
    expect(precioDelRenglon(renglon, 80000, mayoreo)).toBe(80000);
  });

  it('una caja cerrada no se vuelve a tocar', () => {
    // Ya viene cobrada al por mayor por el camino del escaneo.
    const renglon = par('a', 12, { esCaja: true, precioMayorista: 10 });
    const mayoreo = mayoreoPorReferencia([renglon], 12);
    expect(precioDelRenglon(renglon, 80000, mayoreo)).toBe(80000);
  });

  it('un renglón que no está en el mapa conserva su precio', () => {
    const mayoreo = mayoreoPorReferencia([par('a', 12)], 12);
    expect(precioDelRenglon(par('otro', 1), 30000, mayoreo)).toBe(30000);
  });

  it('un precio negociado por debajo del mayorista se respeta', () => {
    // El vendedor ya había bajado ese renglón: subirlo al mayorista sería
    // deshacer una decisión que alguien tomó a propósito.
    const renglon = par('a', 12);
    const mayoreo = mayoreoPorReferencia([renglon], 12);
    expect(precioDelRenglon(renglon, 40000, mayoreo)).toBe(40000);
  });
});
