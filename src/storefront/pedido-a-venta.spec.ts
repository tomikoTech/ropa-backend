import {
  armarVentaDelPedido,
  mensajeDeAceptacion,
  mensajeDeRechazo,
} from './pedido-a-venta.js';

const pedido = [
  {
    itemId: 'i1',
    variantId: 'v1',
    nombre: 'Good Girl',
    cantidadPedida: 6,
    precioUnitario: 40_000,
  },
  {
    itemId: 'i2',
    variantId: 'v2',
    nombre: 'Yara',
    cantidadPedida: 2,
    precioUnitario: 50_000,
  },
];

describe('armarVentaDelPedido', () => {
  it('sin tocar nada va completo, con el descuento elegido en cada renglón', () => {
    const v = armarVentaDelPedido(pedido, { descuentoPorcentaje: 15 });
    expect(v.error).toBeUndefined();
    expect(v.renglones).toEqual([
      { variantId: 'v1', quantity: 6, unitPrice: 40_000, discountPercent: 15 },
      { variantId: 'v2', quantity: 2, unitPrice: 50_000, discountPercent: 15 },
    ]);
    expect(v.recortes).toEqual([]);
  });

  it('se puede mandar menos, y queda dicho; cero saca el renglón', () => {
    const v = armarVentaDelPedido(pedido, { cantidades: { i1: 4, i2: 0 } });
    expect(v.renglones).toHaveLength(1);
    expect(v.recortes).toEqual([
      { nombre: 'Good Girl', pedida: 6, aceptada: 4 },
      { nombre: 'Yara', pedida: 2, aceptada: 0 },
    ]);
  });

  it('no se puede mandar más de lo pedido, ni dejar todo en cero, ni descuento fuera de rango', () => {
    expect(
      armarVentaDelPedido(pedido, { cantidades: { i1: 7 } }).error,
    ).toContain('pidió 6');
    expect(
      armarVentaDelPedido(pedido, { cantidades: { i1: 0, i2: 0 } }).error,
    ).toContain('rechaza');
    expect(
      armarVentaDelPedido(pedido, { descuentoPorcentaje: 120 }).error,
    ).toContain('0 a 100');
  });
});

describe('mensajes de WhatsApp', () => {
  it('la aceptación dice factura, total, descuento, recortes y enlace', () => {
    const m = mensajeDeAceptacion({
      tienda: 'Distri Amber',
      cliente: 'Perfuar',
      numeroPedido: 'PED-1',
      numeroFactura: 'FAC-700',
      total: 204_000,
      descuentoPorcentaje: 15,
      recortes: [{ nombre: 'Good Girl', pedida: 6, aceptada: 4 }],
      enlaceFactura: 'https://r2/f.pdf',
    });
    expect(m).toContain('FAC-700: $204.000 (con 15 % de descuento)');
    expect(m).toContain('pediste 6, van 4');
    expect(m).toContain('https://r2/f.pdf');
  });

  it('el rechazo lleva el motivo si lo hay', () => {
    expect(
      mensajeDeRechazo({
        tienda: 'D',
        cliente: 'P',
        numeroPedido: 'PED-1',
        motivo: 'sin stock',
      }),
    ).toContain('Motivo: sin stock');
    expect(
      mensajeDeRechazo({ tienda: 'D', cliente: 'P', numeroPedido: 'PED-1' }),
    ).not.toContain('Motivo');
  });
});
