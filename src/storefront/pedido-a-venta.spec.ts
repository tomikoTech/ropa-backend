import {
  vencimientoPorDefecto,
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

  it('un precio a mano reemplaza al del pedido, y «sin descuento» deja ese renglón fuera del %', () => {
    // «A Yum Yum le dieron precio de 50.000: que no tome el 20».
    const v = armarVentaDelPedido(pedido, {
      descuentoPorcentaje: 20,
      precios: { i2: 50_000 },
      sinDescuento: ['i2'],
    });
    expect(v.error).toBeUndefined();
    expect(v.renglones).toEqual([
      { variantId: 'v1', quantity: 6, unitPrice: 40_000, discountPercent: 20 },
      {
        variantId: 'v2',
        quantity: 2,
        unitPrice: 50_000,
        discountPercent: 0,
        precioPactado: true,
      },
    ]);
    expect(v.aPrecioFijo).toEqual([{ nombre: 'Yara', precio: 50_000 }]);
    // Sin descuento general no hay nada que contar como «fijo».
    expect(
      armarVentaDelPedido(pedido, { sinDescuento: ['i2'] }).aPrecioFijo,
    ).toEqual([]);
  });

  it('un precio en cero o negativo no pasa', () => {
    expect(armarVentaDelPedido(pedido, { precios: { i1: 0 } }).error).toContain(
      'no puede ser cero',
    );
    expect(
      armarVentaDelPedido(pedido, { precios: { i1: -5 } }).error,
    ).toContain('negativo');
  });

  it('lo agregado entra como renglón nuevo, con precio de lista o a mano, y queda dicho', () => {
    // «Me está pidiendo que le agregue 6 de Good Girl Blush».
    const v = armarVentaDelPedido(pedido, {
      descuentoPorcentaje: 20,
      agregados: [
        {
          variantId: 'v3',
          nombre: 'Good Girl Blush',
          cantidad: 6,
          precioDeLista: 35_000,
        },
        {
          variantId: 'v4',
          nombre: 'Yum Yum',
          cantidad: 1,
          precioDeLista: 60_000,
          precioUnitario: 50_000,
          sinDescuento: true,
        },
      ],
    });
    expect(v.error).toBeUndefined();
    expect(v.renglones.slice(2)).toEqual([
      { variantId: 'v3', quantity: 6, unitPrice: 35_000, discountPercent: 20 },
      {
        variantId: 'v4',
        quantity: 1,
        unitPrice: 50_000,
        discountPercent: 0,
        precioPactado: true,
      },
    ]);
    expect(v.agregados).toEqual([
      { nombre: 'Good Girl Blush', cantidad: 6 },
      { nombre: 'Yum Yum', cantidad: 1 },
    ]);
    expect(v.aPrecioFijo).toEqual([{ nombre: 'Yum Yum', precio: 50_000 }]);
    expect(
      armarVentaDelPedido(pedido, {
        agregados: [
          { variantId: 'v3', nombre: 'X', cantidad: 0, precioDeLista: 1 },
        ],
      }).error,
    ).toContain('mayor que cero');
  });

  it('con todo el pedido en cero pero algo agregado, sí hay venta', () => {
    const v = armarVentaDelPedido(pedido, {
      cantidades: { i1: 0, i2: 0 },
      agregados: [
        { variantId: 'v3', nombre: 'Blush', cantidad: 2, precioDeLista: 1_000 },
      ],
    });
    expect(v.error).toBeUndefined();
    expect(v.renglones).toHaveLength(1);
    expect(v.recortes).toHaveLength(2);
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
    expect(m).not.toContain('Te agregamos');
  });

  it('la aceptación cuenta lo agregado y lo que quedó a precio cerrado', () => {
    const base = {
      tienda: 'Distri Amber',
      cliente: 'Perfuar',
      numeroPedido: 'PED-1',
      numeroFactura: 'FAC-700',
      total: 500_000,
      recortes: [],
      agregados: [{ nombre: 'Good Girl Blush', cantidad: 6 }],
      aPrecioFijo: [{ nombre: 'Yum Yum', precio: 50_000 }],
    };
    const m = mensajeDeAceptacion({ ...base, descuentoPorcentaje: 20 });
    expect(m).toContain('Te agregamos: Good Girl Blush × 6.');
    expect(m).toContain('Yum Yum queda en $50.000 (sin el 20 %).');
    // Sin descuento general, «sin el %» no tiene sentido y no se dice.
    expect(
      mensajeDeAceptacion({ ...base, descuentoPorcentaje: 0 }),
    ).not.toContain('queda en');
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

describe('vencimientoPorDefecto', () => {
  it('usa los días de la tienda, y 30 si no hay', () => {
    const hoy = new Date('2026-10-06T20:00:00.000Z'); // 3 pm en Colombia
    expect(vencimientoPorDefecto(15, hoy)).toBe('2026-10-21');
    expect(vencimientoPorDefecto(null, hoy)).toBe('2026-11-05');
    expect(vencimientoPorDefecto(0, hoy)).toBe('2026-11-05');
  });
  it('cuenta el día en Colombia aunque en UTC ya sea mañana', () => {
    const noche = new Date('2026-10-07T02:00:00.000Z'); // 9 pm del 6 en Colombia
    expect(vencimientoPorDefecto(30, noche)).toBe('2026-11-05');
  });
});

describe('precio pactado', () => {
  it('un precio puesto a mano sale como pactado; el de lista no', () => {
    const pedido = [
      {
        itemId: 'i1',
        variantId: 'v1',
        nombre: 'Yum Yum',
        cantidadPedida: 1,
        precioUnitario: 70_000,
      },
      {
        itemId: 'i2',
        variantId: 'v2',
        nombre: 'Light Blue',
        cantidadPedida: 1,
        precioUnitario: 30_000,
      },
    ];
    const r = armarVentaDelPedido(pedido, {
      precios: { i1: 50_000 },
      sinDescuento: ['i1'],
      descuentoPorcentaje: 20,
    });
    const porVariante = new Map(r.renglones.map((x) => [x.variantId, x]));
    expect(porVariante.get('v1')?.precioPactado).toBe(true);
    expect(porVariante.get('v2')?.precioPactado).toBeUndefined();
  });
  it('un agregado con precio a mano también es pactado', () => {
    const r = armarVentaDelPedido([], {
      agregados: [
        {
          variantId: 'v9',
          cantidad: 2,
          precioUnitario: 45_000,
          nombre: 'Blush',
          precioDeLista: 35_000,
        },
        { variantId: 'v8', cantidad: 1, nombre: 'Otro', precioDeLista: 20_000 },
      ],
    });
    const porVariante = new Map(r.renglones.map((x) => [x.variantId, x]));
    expect(porVariante.get('v9')?.precioPactado).toBe(true);
    expect(porVariante.get('v8')?.precioPactado).toBeUndefined();
  });
});
