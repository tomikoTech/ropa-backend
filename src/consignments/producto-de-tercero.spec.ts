import {
  claveDeProducto,
  normalizar,
  mismoProducto,
} from './producto-de-tercero.js';

const p = (o: Record<string, unknown> = {}) => ({
  thirdPartyName: 'Nico',
  productDescription: 'Nike Air Force',
  size: '42',
  color: 'Blanco',
  ...o,
});

describe('normalizar lo que se escribio a mano', () => {
  it('no distingue mayusculas', () => {
    expect(normalizar('NIKE')).toBe(normalizar('nike'));
  });

  // Se escribe corriendo, entre clientes.
  it('no le importan los espacios de mas', () => {
    expect(normalizar('  Nike   Air  ')).toBe('nike air');
  });

  it('ni las tildes', () => {
    expect(normalizar('Adidas S\u00faper')).toBe(normalizar('Adidas Super'));
  });

  // La enye si distingue palabras.
  it('pero la enye no se toca', () => {
    expect(normalizar('Ni\u00f1o')).not.toBe(normalizar('Nino'));
  });

  it('lo vacio es vacio', () => {
    expect(normalizar('   ')).toBe('');
    expect(normalizar(undefined)).toBe('');
  });
});

describe('cuando es el mismo producto', () => {
  it('el mismo escrito distinto, si', () => {
    expect(
      mismoProducto(p(), p({ productDescription: '  nike   air force ' })),
    ).toBe(true);
  });

  // La talla es parte del producto: el costo de una 38 no tiene por que ser
  // el de una 44.
  it('otra talla, no', () => {
    expect(mismoProducto(p(), p({ size: '43' }))).toBe(false);
  });

  it('otro color, no', () => {
    expect(mismoProducto(p(), p({ color: 'Negro' }))).toBe(false);
  });

  // Dos personas pueden venderte el mismo modelo a distinto precio, y a cada
  // una le debes lo suyo.
  it('el mismo zapato de otro dueno, no', () => {
    expect(mismoProducto(p(), p({ thirdPartyName: 'Ricardo' }))).toBe(false);
  });

  it('sin talla ni color sigue siendo comparable', () => {
    expect(
      mismoProducto(
        p({ size: '', color: '' }),
        p({ size: undefined, color: undefined }),
      ),
    ).toBe(true);
  });
});

describe('la clave con la que se guarda', () => {
  it('es estable: la misma entrada da la misma clave', () => {
    expect(claveDeProducto(p())).toBe(claveDeProducto(p()));
  });

  // Pegando los campos con un espacio, «Nike Air» talla «Force» quedaria
  // igual que «Nike» talla «Air Force».
  it('no mezcla campos: mover una palabra de campo cambia la clave', () => {
    expect(
      claveDeProducto(
        p({ productDescription: 'Nike Air', size: 'Force', color: '' }),
      ),
    ).not.toBe(
      claveDeProducto(
        p({ productDescription: 'Nike', size: 'Air Force', color: '' }),
      ),
    );
  });

  // El separador tiene que ser algo que nadie pueda teclear. Con un guion,
  // «Nike-42» talla «X» quedaria igual que «Nike» talla «42-X».
  it('un signo corriente en el texto no puede hacer de separador', () => {
    for (const signo of ['-', '|', '/', '.']) {
      expect(
        claveDeProducto(
          p({ productDescription: `Nike${signo}42`, size: 'X', color: 'Y' }),
        ),
      ).not.toBe(
        claveDeProducto(
          p({ productDescription: 'Nike', size: `42${signo}X`, color: 'Y' }),
        ),
      );
    }
  });
});
