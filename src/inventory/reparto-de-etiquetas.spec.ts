import { ConsecutivoAgotadoError } from './consecutivo-del-dia.js';
import { repartirEtiquetasDelDia } from './reparto-de-etiquetas.js';

/**
 * Dónde caben las etiquetas que se van a crear hoy.
 *
 * El formato es `AAMMDD | orden(4) | renglón(3) | unidad(3)`. Cada movimiento
 * tomaba **un renglón entero** aunque creara una sola etiqueta, así que los
 * 999 puestos de unidad de ese renglón se perdían y el día se acababa a los
 * 999 movimientos. Se acabó de verdad: paró una jornada entera.
 *
 * Ahora las etiquetas van llenando el renglón que esté abierto y solo pasan al
 * siguiente cuando ese se llena.
 */

/** El verificador EAN, calculado acá para no depender del código probado. */
const conVerificador = (cuerpo: string) => {
  let impar = 0;
  let par = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const d = Number(cuerpo[i]);
    if (i % 2 === 0) impar += d;
    else par += d;
  }
  return cuerpo + String((10 - ((impar + par * 3) % 10)) % 10);
};

/** Un código nuestro del 23 de agosto de 2026: renglón `r`, unidad `u`. */
const nuestro = (r: number, u: number) =>
  conVerificador(
    `2608230000${String(r).padStart(3, '0')}${String(u).padStart(3, '0')}`,
  );

const HOY = new Date(2026, 7, 23);

describe('repartirEtiquetasDelDia', () => {
  it('el primer movimiento del día abre el renglón uno', () => {
    expect(repartirEtiquetasDelDia([], HOY, 3)).toEqual([
      { renglon: 1, desdeUnidad: 1, cuantas: 3 },
    ]);
  });

  it('el segundo movimiento sigue en el mismo renglón', () => {
    // Esto es el arreglo entero: antes se llevaba el renglón 2 y dejaba 996
    // puestos vacíos en el 1.
    expect(repartirEtiquetasDelDia([nuestro(1, 1), nuestro(1, 2)], HOY, 2)).toEqual([
      { renglon: 1, desdeUnidad: 3, cuantas: 2 },
    ]);
  });

  it('cuando el renglón se llena, pasa al siguiente desde la unidad uno', () => {
    expect(repartirEtiquetasDelDia([nuestro(1, 999)], HOY, 2)).toEqual([
      { renglon: 2, desdeUnidad: 1, cuantas: 2 },
    ]);
  });

  it('un movimiento grande se parte entre varios renglones', () => {
    // Un ajuste de mil pares no cabía en ningún renglón y reventaba con «la
    // secuencia de bulto 1000 no cabe». Ahora se reparte.
    expect(repartirEtiquetasDelDia([nuestro(1, 998)], HOY, 3)).toEqual([
      { renglon: 1, desdeUnidad: 999, cuantas: 1 },
      { renglon: 2, desdeUnidad: 1, cuantas: 2 },
    ]);
  });

  it('reparte en tantos renglones como haga falta', () => {
    const tramos = repartirEtiquetasDelDia([], HOY, 2500);
    expect(tramos).toEqual([
      { renglon: 1, desdeUnidad: 1, cuantas: 999 },
      { renglon: 2, desdeUnidad: 1, cuantas: 999 },
      { renglon: 3, desdeUnidad: 1, cuantas: 502 },
    ]);
    expect(tramos.reduce((s, t) => s + t.cuantas, 0)).toBe(2500);
  });

  it('continúa desde el renglón más alto, no desde el último de la lista', () => {
    // Los códigos llegan de la base sin orden garantizado.
    const desordenados = [nuestro(3, 5), nuestro(1, 900), nuestro(2, 7)];
    expect(repartirEtiquetasDelDia(desordenados, HOY, 1)).toEqual([
      { renglon: 3, desdeUnidad: 6, cuantas: 1 },
    ]);
  });

  it('cuenta la unidad más alta de ese renglón, no la de otro', () => {
    // El renglón 2 va por la unidad 7 aunque el 1 llegue a 900.
    expect(repartirEtiquetasDelDia([nuestro(1, 900), nuestro(2, 7)], HOY, 1)).toEqual([
      { renglon: 2, desdeUnidad: 8, cuantas: 1 },
    ]);
  });

  it('dentro del renglón se queda con la unidad más alta, no con la última', () => {
    // Los códigos llegan de la base sin orden, así que dos del mismo renglón
    // pueden venir de mayor a menor. Quedarse con la última daría una etiqueta
    // con un código ya usado, y `stock_units.barcode` es único: la entrada
    // entera se caería.
    expect(repartirEtiquetasDelDia([nuestro(2, 9), nuestro(2, 3)], HOY, 1)).toEqual([
      { renglon: 2, desdeUnidad: 10, cuantas: 1 },
    ]);
  });

  it('ignora un código de otro largo aunque el verificador le cuadre', () => {
    // Los de demachine son de 18 dígitos. Uno de cada diez pasa la
    // comprobación EAN por puro azar —se midió sobre sus 3.224 códigos— así
    // que el verificador solo no alcanza: hace falta mirar el largo.
    const ajeno = conVerificador('26082300000500019');
    expect(ajeno).toHaveLength(18);
    expect(repartirEtiquetasDelDia([ajeno], HOY, 1)).toEqual([
      { renglon: 1, desdeUnidad: 1, cuantas: 1 },
    ]);
  });

  it('ignora un código nuestro y válido, pero de otro día', () => {
    // Con su verificador bien puesto: lo que lo descarta es la fecha, no que
    // esté mal formado.
    const ayer = conVerificador('2608220000005005');
    expect(repartirEtiquetasDelDia([ayer], HOY, 1)).toEqual([
      { renglon: 1, desdeUnidad: 1, cuantas: 1 },
    ]);
  });

  it('ignora un código del día y de nuestro largo si el verificador no cuadra', () => {
    // Es la única señal que separa un código nuestro de uno ajeno que se le
    // parece. Sin ella, un código de otro sistema empuja el consecutivo y se
    // come el día.
    const parecido = '2608230000500001' + '0';
    expect(parecido).toHaveLength(17);
    const bueno = conVerificador('2608230000500001');
    expect(parecido).not.toBe(bueno); // el 0 no es el verificador correcto
    expect(repartirEtiquetasDelDia([parecido], HOY, 1)).toEqual([
      { renglon: 1, desdeUnidad: 1, cuantas: 1 },
    ]);
  });

  it('aguanta basura sin reventar', () => {
    expect(repartirEtiquetasDelDia(['', 'ABC', '123'], HOY, 1)).toEqual([
      { renglon: 1, desdeUnidad: 1, cuantas: 1 },
    ]);
  });

  it('avisa cuando ya no cabe nada más en el día', () => {
    // 999 renglones × 999 unidades. Llegar acá es otra cosa que llegar a 999
    // movimientos: son 998.001 pares en un día.
    expect(() => repartirEtiquetasDelDia([nuestro(999, 999)], HOY, 1)).toThrow(
      ConsecutivoAgotadoError,
    );
  });

  it('avisa también cuando cabe una parte pero no todo', () => {
    // Media entrega registrada y media no sería peor que no registrar nada:
    // quedarían pares en bodega sin etiqueta y nadie sabría cuáles.
    expect(() => repartirEtiquetasDelDia([nuestro(999, 990)], HOY, 20)).toThrow(
      ConsecutivoAgotadoError,
    );
  });

  it('no pedir nada no reserva nada', () => {
    // La guarda de arriba y la condición del bucle dicen lo mismo, así que
    // quitar cualquiera de las dos no rompe esta prueba. Está dicho en el
    // archivo; no se tapa.
    expect(repartirEtiquetasDelDia([nuestro(1, 1)], HOY, 0)).toEqual([]);
    expect(repartirEtiquetasDelDia([], HOY, -3)).toEqual([]);
  });

  it('el último puesto del día sí se usa', () => {
    // Un error de «menor que» en vez de «menor o igual» se comería la última
    // etiqueta del día sin que nadie lo notara.
    expect(repartirEtiquetasDelDia([nuestro(999, 998)], HOY, 1)).toEqual([
      { renglon: 999, desdeUnidad: 999, cuantas: 1 },
    ]);
  });
});
