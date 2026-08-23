import { diasDeMora, estaVencida } from './vencimiento.js';

/**
 * Cuándo una cuenta está vencida, y por cuántos días.
 *
 * La regla del negocio es la del mostrador, no la del reloj: **el día que
 * vence todavía se puede pagar**. Una cuenta pactada para el 25 no está en
 * mora el 25; lo está el 26, con un día.
 *
 * Antes esto se calculaba restando milisegundos contra `Date.now()`, y por eso
 * una cuenta aparecía «Vencida» en rojo desde la madrugada del mismo día en
 * que se había quedado de pagar. Al cliente que llegaba a las once de la
 * mañana a cumplir se le mostraba una cuenta vencida.
 *
 * Todo en días de calendario, sobre texto `AAAA-MM-DD`: un día no es un
 * instante, y tratarlo como instante es lo que lo rompe.
 */
describe('diasDeMora', () => {
  it('el día que vence todavía no está en mora', () => {
    // La que importa: se pactó para hoy y hoy se puede pagar.
    expect(diasDeMora('2026-12-25', '2026-12-25')).toBe(0);
  });

  it('al día siguiente ya debe un día', () => {
    expect(diasDeMora('2026-12-25', '2026-12-26')).toBe(1);
  });

  it('cuenta los días que pasaron, no las horas', () => {
    expect(diasDeMora('2026-12-01', '2026-12-25')).toBe(24);
  });

  it('lo que vence más adelante no tiene mora, ni negativa', () => {
    // Devolver −10 haría que un total de mora se restara solo.
    expect(diasDeMora('2027-01-04', '2026-12-25')).toBe(0);
  });

  it('cruza el fin de mes y el fin de año sin perder un día', () => {
    expect(diasDeMora('2026-01-31', '2026-02-01')).toBe(1);
    expect(diasDeMora('2026-12-31', '2027-01-01')).toBe(1);
    expect(diasDeMora('2028-02-28', '2028-03-01')).toBe(2); // bisiesto
  });

  it('sin fecha de vencimiento no hay mora', () => {
    // Cartera vieja importada que nunca trajo el plazo.
    expect(diasDeMora(null, '2026-12-25')).toBe(0);
    expect(diasDeMora(undefined, '2026-12-25')).toBe(0);
    expect(diasDeMora('', '2026-12-25')).toBe(0);
  });

  it('una fecha que no se puede leer sale sin mora, no tumba el reporte', () => {
    // Acá sí se traga el error, a diferencia de cuando se escribe: una fila
    // vieja ilegible no puede dejar sin cartera a toda la tienda. Sale en cero
    // y se ve en la lista, que es como se descubre.
    expect(diasDeMora('25/12/2026', '2026-12-25')).toBe(0);
    expect(diasDeMora('2026-02-31', '2026-12-25')).toBe(0);
  });

  it('lee una marca de tiempo como el día de la tienda', () => {
    // Algunas filas guardan el vencimiento con hora. Las 9 de la noche del 24
    // en Colombia son el 25 en UTC: el día es el 24.
    expect(diasDeMora('2026-12-25T02:00:00.000Z', '2026-12-25')).toBe(1);
  });
});

describe('estaVencida', () => {
  it('el día pactado no está vencida', () => {
    expect(estaVencida('2026-12-25', '2026-12-25')).toBe(false);
  });

  it('el día siguiente sí', () => {
    expect(estaVencida('2026-12-25', '2026-12-26')).toBe(true);
  });

  it('antes del plazo, no', () => {
    expect(estaVencida('2026-12-25', '2026-12-01')).toBe(false);
  });

  it('sin fecha, no', () => {
    expect(estaVencida(null, '2026-12-25')).toBe(false);
  });
});
