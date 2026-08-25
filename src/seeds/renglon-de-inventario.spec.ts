import {
  enSingular,
  generoPorElNombre,
  leerLista,
  leerRenglon,
  esComentario,
  leerSeccion,
  nombreDeProducto,
} from './renglon-de-inventario.js';

describe('enSingular', () => {
  it('quita la s del plural corriente', () => {
    expect(enSingular('gorras')).toBe('gorra');
    expect(enSingular('camisetas')).toBe('camiseta');
    expect(enSingular('polos')).toBe('polo');
    expect(enSingular('conjuntos')).toBe('conjunto');
  });

  it('quita el -es entero', () => {
    // «carrieles» no es «carriele».
    expect(enSingular('carrieles')).toBe('carriel');
  });

  it('devuelve la tilde a los plurales en -ones', () => {
    // Es el caso que se rompía calladito: «pantalones» → «pantalone».
    expect(enSingular('pantalones')).toBe('pantalón');
    expect(enSingular('lociones')).toBe('loción');
  });

  it('convierte -ces en -z', () => {
    expect(enSingular('lápices')).toBe('lápiz');
  });

  it('no toca lo que ya está en singular', () => {
    expect(enSingular('sudadera')).toBe('sudadera');
    expect(enSingular('boxer')).toBe('boxer');
    expect(enSingular('algodón')).toBe('algodón');
  });

  it('deja quietas las palabras cortas que acaban en s', () => {
    // «los pantalones»: quitarle la s a «los» deja «lo».
    expect(enSingular('los')).toBe('los');
    expect(enSingular('de')).toBe('de');
  });
});

describe('nombreDeProducto', () => {
  it('deja el nombre en singular y capitalizado', () => {
    expect(nombreDeProducto('30 carrieles'.split(' ')[1])).toBe('Carriel');
    expect(nombreDeProducto('gorras')).toBe('Gorra');
  });

  it('singulariza cada palabra que venga en plural', () => {
    expect(nombreDeProducto('conjuntos cortos')).toBe('Conjunto Corto');
    expect(nombreDeProducto('conjuntos largos')).toBe('Conjunto Largo');
  });

  it('no capitaliza los conectores en mitad del nombre', () => {
    // «Polo De Hombre» se lee como un error de quien lo escribió.
    expect(nombreDeProducto('polos de hombre')).toBe('Polo de Hombre');
  });

  it('sí capitaliza un conector si abre el nombre', () => {
    expect(nombreDeProducto('de la casa')).toBe('De la Casa');
  });

  it('respeta lo que ya venía en singular dentro de la frase', () => {
    expect(nombreDeProducto('camisetas deportiva drifit')).toBe(
      'Camiseta Deportiva Drifit',
    );
    expect(nombreDeProducto('pantaloneta algodón')).toBe('Pantaloneta Algodón');
  });

  it('aguanta espacios de sobra', () => {
    expect(nombreDeProducto('  gorras   negras  ')).toBe('Gorra Negra');
  });
});

describe('leerRenglon', () => {
  it('separa la cantidad del nombre', () => {
    expect(leerRenglon('172 gorras')).toEqual({
      cantidad: 172,
      nombre: 'Gorra',
      categoria: null,
      crudo: '172 gorras',
    });
  });

  it('le quita a WhatsApp su sello y quién lo escribió', () => {
    // Es como llega de verdad cuando el cliente reenvía el chat.
    expect(leerRenglon('[5:39 p. m., 25/8/2026] Andres Ropa Elite: 4 boxer')).
      toEqual({
        cantidad: 4,
        nombre: 'Boxer',
        categoria: null,
        crudo: '4 boxer',
      });
  });

  it('no se traga un renglón sin cantidad', () => {
    // Si el cliente escribe solo «gorras», cuántas es una adivinanza.
    expect(leerRenglon('gorras')).toBeNull();
    expect(leerRenglon('camisetas x 20')).toBeNull();
  });

  it('cero unidades no es un renglón de inventario', () => {
    expect(leerRenglon('0 gorras')).toBeNull();
  });

  it('una cantidad sin nombre tampoco', () => {
    expect(leerRenglon('172')).toBeNull();
  });
});

describe('leerLista', () => {
  const MENSAJE = `30 Carrieles
33 conjuntos cortos

172 gorras
[5:42 p. m., 25/8/2026] Andres Ropa Elite Canario: 12 lociones`;

  it('lee el mensaje entero', () => {
    const { renglones, ilegibles } = leerLista(MENSAJE);
    expect(ilegibles).toEqual([]);
    expect(renglones.map((r) => [r.cantidad, r.nombre])).toEqual([
      [30, 'Carriel'],
      [33, 'Conjunto Corto'],
      [172, 'Gorra'],
      [12, 'Loción'],
    ]);
  });

  it('las líneas en blanco no son errores', () => {
    expect(leerLista('\n\n  \n').ilegibles).toEqual([]);
    expect(leerLista('\n\n  \n').renglones).toEqual([]);
  });

  it('lo que no entiende lo devuelve aparte, no lo descarta', () => {
    // Callarse un renglón es cargar un inventario incompleto sin avisar.
    const { renglones, ilegibles } = leerLista('30 gorras\nmuchas camisetas');
    expect(renglones).toHaveLength(1);
    expect(ilegibles).toEqual(['muchas camisetas']);
  });

  it('conserva el orden del mensaje', () => {
    const { renglones } = leerLista('5 gorras\n3 bermudas\n9 polos');
    expect(renglones.map((r) => r.nombre)).toEqual([
      'Gorra',
      'Bermuda',
      'Polo',
    ]);
  });
});

describe('leerSeccion', () => {
  it('reconoce una línea de sección', () => {
    expect(leerSeccion('# Camisetas')).toBe('Camisetas');
    expect(leerSeccion('#Accesorios')).toBe('Accesorios');
    expect(leerSeccion('  ##  Ropa interior  ')).toBe('Ropa interior');
  });

  it('un renglón normal no es una sección', () => {
    expect(leerSeccion('30 Carrieles')).toBeNull();
    expect(leerSeccion('')).toBeNull();
  });

  it('una almohadilla sola no abre nada', () => {
    // Abrir una sección sin nombre dejaría los productos siguientes en una
    // categoría llamada «».
    expect(leerSeccion('#')).toBeNull();
    expect(leerSeccion('#   ')).toBeNull();
  });
});

describe('leerLista con secciones', () => {
  const CON_SECCIONES = `# Accesorios
30 Carrieles
172 gorras

# Camisetas
418 camisetas`;

  it('cada renglón se queda con la sección que lo cubre', () => {
    const { renglones } = leerLista(CON_SECCIONES);
    expect(renglones.map((r) => [r.nombre, r.categoria])).toEqual([
      ['Carriel', 'Accesorios'],
      ['Gorra', 'Accesorios'],
      ['Camiseta', 'Camisetas'],
    ]);
  });

  it('lo que va antes de la primera sección se queda sin categoría', () => {
    // Y el seed decide qué hacer con eso; acá no se inventa una.
    const { renglones } = leerLista('5 gorras\n# Camisetas\n2 polos');
    expect(renglones[0].categoria).toBeNull();
    expect(renglones[1].categoria).toBe('Camisetas');
  });

  it('la sección no cuenta como renglón ni como ilegible', () => {
    const { renglones, ilegibles } = leerLista('# Camisetas\n418 camisetas');
    expect(renglones).toHaveLength(1);
    expect(ilegibles).toEqual([]);
  });
});

describe('generoPorElNombre', () => {
  it('lo toma del nombre cuando el nombre lo dice', () => {
    expect(generoPorElNombre('Camiseta Dama')).toBe('MUJER');
    expect(generoPorElNombre('Polo de Hombre')).toBe('HOMBRE');
  });

  it('no distingue mayúsculas ni tildes', () => {
    expect(generoPorElNombre('CAMISETA NIÑA')).toBe('MUJER');
    expect(generoPorElNombre('Conjunto Niño')).toBe('HOMBRE');
  });

  it('lo que no lo dice queda unisex', () => {
    // Un bóxer o una blusa no traen el dato en el nombre, y suponerlo le
    // esconde productos a media clientela.
    expect(generoPorElNombre('Boxer')).toBe('UNISEX');
    expect(generoPorElNombre('Gorra')).toBe('UNISEX');
    expect(generoPorElNombre('Camiseta Texturizada')).toBe('UNISEX');
  });

  it('no confunde una palabra que contenga otra', () => {
    // «Hombrera» no es ropa de hombre.
    expect(generoPorElNombre('Hombrera')).toBe('UNISEX');
    expect(generoPorElNombre('Damasco')).toBe('UNISEX');
  });
});

describe('comentarios', () => {
  it('una almohadilla sola es comentario, no un error', () => {
    // El encabezado explicativo del archivo tumbaba la carga entera.
    const { renglones, ilegibles } = leerLista('#\n# Camisetas\n418 camisetas');
    expect(ilegibles).toEqual([]);
    expect(renglones.map((r) => [r.nombre, r.categoria])).toEqual([
      ['Camiseta', 'Camisetas'],
    ]);
  });

  it('un comentario vacío no borra la sección abierta', () => {
    const { renglones } = leerLista('# Camisetas\n#\n418 camisetas');
    expect(renglones[0].categoria).toBe('Camisetas');
  });

  it('esComentario reconoce la almohadilla venga como venga', () => {
    expect(esComentario('# Camisetas')).toBe(true);
    expect(esComentario('   #')).toBe(true);
    expect(esComentario('30 gorras')).toBe(false);
  });
});
