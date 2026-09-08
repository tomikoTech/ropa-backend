import {
  apagaElRastreoConBultosVivos,
  porQueNoSePuedeApagar,
} from './apagar-el-rastreo.js';

describe('apagar el rastreo por unidades', () => {
  it('no se puede si hay cajas vivas', () => {
    expect(
      apagaElRastreoConBultosVivos({
        actual: null,
        pedido: false,
        bultosVivos: 3,
      }),
    ).toBe(true);
  });

  it('se puede si no queda ninguna caja', () => {
    expect(
      apagaElRastreoConBultosVivos({
        actual: null,
        pedido: false,
        bultosVivos: 0,
      }),
    ).toBe(false);
  });

  it('guardar sin tocar el interruptor nunca estorba', () => {
    // El caso corriente: se edita el precio y el rastreo ni se menciona.
    expect(
      apagaElRastreoConBultosVivos({
        actual: null,
        pedido: undefined,
        bultosVivos: 9,
      }),
    ).toBe(false);
  });

  it('encenderlo se puede siempre', () => {
    expect(
      apagaElRastreoConBultosVivos({
        actual: false,
        pedido: true,
        bultosVivos: 9,
      }),
    ).toBe(false);
  });

  it('dejarlo en «lo que diga la tienda» tampoco lo apaga', () => {
    expect(
      apagaElRastreoConBultosVivos({
        actual: true,
        pedido: null,
        bultosVivos: 9,
      }),
    ).toBe(false);
  });

  it('reguardar un apagado que ya estaba apagado no molesta', () => {
    expect(
      apagaElRastreoConBultosVivos({
        actual: false,
        pedido: false,
        bultosVivos: 9,
      }),
    ).toBe(false);
  });
});

describe('el mensaje', () => {
  it('dice cuántas cajas y qué hacer', () => {
    const m = porQueNoSePuedeApagar(3);
    expect(m).toContain('3 cajas etiquetadas');
    expect(m).toContain('Sácalas del inventario');
  });

  it('una sola caja va en singular', () => {
    expect(porQueNoSePuedeApagar(1)).toContain('una caja etiquetada');
  });
});
