import {
  contarUnidades,
  esTipoDeNegocio,
  perfilDelNegocio,
  tipoDeNegocioDe,
  tipoDeProductoPorDefecto,
} from './perfil-del-negocio.js';

describe('perfilDelNegocio', () => {
  it('una tienda sin tipo es de calzado, como todas las de antes', () => {
    expect(tipoDeNegocioDe(null)).toBe('calzado');
    expect(tipoDeNegocioDe({})).toBe('calzado');
    expect(perfilDelNegocio(undefined).tipo).toBe('calzado');
  });

  it('la que tenía Producción encendida y no dice qué es, es perfumería', () => {
    // Distri Amber antes de la migración: así no amanece hablando de pares.
    expect(tipoDeNegocioDe({ productionEnabled: true })).toBe('perfumeria');
  });

  it('el tipo guardado manda sobre la pista de Producción', () => {
    expect(
      tipoDeNegocioDe({ tipoDeNegocio: 'calzado', productionEnabled: true }),
    ).toBe('calzado');
  });

  it('un tipo desconocido no rompe nada: cae a calzado', () => {
    expect(tipoDeNegocioDe({ tipoDeNegocio: 'ferreteria' })).toBe('calzado');
    expect(esTipoDeNegocio('ferreteria')).toBe(false);
    expect(esTipoDeNegocio('perfumeria')).toBe(true);
  });

  it('calzado con cajas cuenta pares; sin cajas, unidades', () => {
    const conCajas = perfilDelNegocio({
      tipoDeNegocio: 'calzado',
      unitTrackingEnabled: true,
    });
    expect(conCajas.rotuloDeUnidades).toBe('pares');
    expect(conCajas.tieneCajas).toBe(true);
    expect(conCajas.tieneTallas).toBe(true);
    const sinCajas = perfilDelNegocio({
      tipoDeNegocio: 'calzado',
      unitTrackingEnabled: false,
    });
    expect(sinCajas.rotuloDeUnidades).toBe('unidades');
    expect(sinCajas.tieneCajas).toBe(false);
  });

  it('perfumería: unidades, sin tallas ni cajas aunque el interruptor esté prendido', () => {
    const p = perfilDelNegocio({
      tipoDeNegocio: 'perfumeria',
      unitTrackingEnabled: true,
    });
    expect(p.rotuloDeUnidades).toBe('unidades');
    expect(p.unidad).toBe('unidad');
    expect(p.tieneTallas).toBe(false);
    expect(p.tieneCajas).toBe(false);
    expect(p.soloTerminadosEnVenta).toBe(true);
    expect(p.pedidoSiempreADomicilio).toBe(true);
  });

  it('otro comercio: unidades con tallas, y cajas si las pidió', () => {
    const p = perfilDelNegocio({
      tipoDeNegocio: 'general',
      unitTrackingEnabled: true,
    });
    expect(p.rotuloDeUnidades).toBe('unidades');
    expect(p.tieneTallas).toBe(true);
    expect(p.tieneCajas).toBe(true);
    expect(p.soloTerminadosEnVenta).toBe(false);
  });
});

describe('contarUnidades', () => {
  it('pone la palabra de cada tienda, en singular y plural', () => {
    const calzado = perfilDelNegocio({
      tipoDeNegocio: 'calzado',
      unitTrackingEnabled: true,
    });
    const perfumeria = perfilDelNegocio({ tipoDeNegocio: 'perfumeria' });
    expect(contarUnidades(calzado, 1)).toBe('1 par');
    expect(contarUnidades(calzado, 24)).toBe('24 pares');
    expect(contarUnidades(perfumeria, 1)).toBe('1 unidad');
    expect(contarUnidades(perfumeria, 6)).toBe('6 unidades');
  });
});

describe('tipoDeProductoPorDefecto', () => {
  const perfumeria = perfilDelNegocio({ tipoDeNegocio: 'perfumeria' });
  const calzado = perfilDelNegocio({ tipoDeNegocio: 'calzado' });

  it('en una perfumería, sin pedir nada, solo producto terminado', () => {
    expect(tipoDeProductoPorDefecto(perfumeria)).toBe('STANDARD');
    expect(tipoDeProductoPorDefecto(perfumeria, '')).toBe('STANDARD');
  });

  it('las pestañas de Frascos y Esencias piden su tipo y lo reciben', () => {
    expect(tipoDeProductoPorDefecto(perfumeria, 'FRASCO')).toBe('FRASCO');
    expect(tipoDeProductoPorDefecto(perfumeria, 'ESSENCE')).toBe('ESSENCE');
  });

  it('una zapatería sigue viendo todo', () => {
    expect(tipoDeProductoPorDefecto(calzado)).toBeUndefined();
  });
});
