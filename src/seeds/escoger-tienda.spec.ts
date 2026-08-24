import { escogerTienda } from './escoger-tienda.js';

const t = (slug: string) => ({ id: slug, name: slug.toUpperCase(), slug });

describe('escogerTienda', () => {
  it('sin tiendas, lo dice y no devuelve nada', () => {
    expect(() => escogerTienda([], undefined)).toThrow(/ninguna tienda/i);
  });

  it('con una sola tienda y sin slug, esa es', () => {
    expect(escogerTienda([t('amawad')], undefined).slug).toBe('amawad');
  });

  // El punto de todo esto: en producción hay muchas tiendas y «la primera»
  // sería la de otro cliente.
  it('con varias y sin slug, se niega a adivinar', () => {
    expect(() =>
      escogerTienda([t('the-culture'), t('amawad')], undefined),
    ).toThrow(/TENANT/);
  });

  it('al negarse, dice cuáles hay para no dejar a nadie adivinando', () => {
    expect(() =>
      escogerTienda([t('the-culture'), t('amawad')], undefined),
    ).toThrow(/the-culture, amawad/);
  });

  it('con slug, escoge esa aunque no sea la primera', () => {
    expect(escogerTienda([t('the-culture'), t('amawad')], 'amawad').slug).toBe(
      'amawad',
    );
  });

  it('un slug que no existe es un error, no la primera de la lista', () => {
    expect(() =>
      escogerTienda([t('the-culture'), t('amawad')], 'amawd'),
    ).toThrow(/No existe la tienda "amawd"/);
  });

  // Escribir el slug de una tienda de una sola tienda mal tampoco puede pasar
  // por alto: si no, se crea la cuenta en la única que hay creyendo otra cosa.
  it('con una sola tienda, un slug equivocado también falla', () => {
    expect(() => escogerTienda([t('amawad')], 'sportcali')).toThrow(
      /No existe/,
    );
  });
});
