import {
  CobroActual,
  metodoDeHoy,
  planDelCambio,
  porQueNoSePuedeCambiar,
} from './metodo-de-pago-de-la-venta.js';

const venta = (parcial: Partial<CobroActual> = {}): CobroActual => ({
  totalCentavos: 1_308_000,
  pagos: [],
  cartera: null,
  cobrada: true,
  intencion: null,
  clienteRegistrado: true,
  ...parcial,
});

const enEfectivo = (monto = 1_308_000) => [
  { id: 'pago-1', metodo: 'EFECTIVO', montoCentavos: monto },
];

const aCredito = (parcial = {}) => ({
  id: 'ar-1',
  totalCentavos: 1_308_000,
  abonadoCentavos: 0,
  ...parcial,
});

describe('con qué figura pagada hoy', () => {
  it('la cartera manda sobre todo lo demás', () => {
    expect(metodoDeHoy(venta({ cartera: aCredito() }))).toBe('CREDITO');
  });

  it('una cartera ya saldada no la vuelve a crédito', () => {
    expect(
      metodoDeHoy(
        venta({ cartera: aCredito({ totalCentavos: 0 }), pagos: enEfectivo() }),
      ),
    ).toBe('EFECTIVO');
  });

  it('sin pagos ni cartera vale la intención', () => {
    expect(
      metodoDeHoy(venta({ cobrada: false, intencion: 'TRANSFERENCIA' })),
    ).toBe('TRANSFERENCIA');
  });
});

describe('cuándo no se puede', () => {
  it('no toca una venta cobrada con dos métodos distintos', () => {
    const motivo = porQueNoSePuedeCambiar(
      venta({
        pagos: [
          { id: 'a', metodo: 'EFECTIVO', montoCentavos: 500_000 },
          { id: 'b', metodo: 'TARJETA', montoCentavos: 808_000 },
        ],
      }),
      { metodo: 'TRANSFERENCIA' },
    );
    expect(motivo).toContain('más de un método');
  });

  it('no toca una venta mixta (parte cobrada, parte a crédito)', () => {
    const motivo = porQueNoSePuedeCambiar(
      venta({
        pagos: enEfectivo(300_000),
        cartera: aCredito({ totalCentavos: 1_008_000 }),
      }),
      { metodo: 'EFECTIVO' },
    );
    expect(motivo).toContain('mixta');
    expect(motivo).toContain('$3.000');
    expect(motivo).toContain('$10.080');
  });

  it('no saca del crédito una venta que ya tiene abonos', () => {
    const motivo = porQueNoSePuedeCambiar(
      venta({ cartera: aCredito({ abonadoCentavos: 400_000 }) }),
      { metodo: 'EFECTIVO' },
    );
    expect(motivo).toContain('$4.000');
    expect(motivo).toContain('abonos');
  });

  it('deja pasar el cambio dentro del crédito aunque tenga abonos', () => {
    expect(
      porQueNoSePuedeCambiar(
        venta({ cartera: aCredito({ abonadoCentavos: 400_000 }) }),
        { metodo: 'CREDITO', fechaDeVencimiento: '2026-10-01' },
      ),
    ).toBeNull();
  });

  it('exige cliente registrado para pasar a crédito', () => {
    const motivo = porQueNoSePuedeCambiar(
      venta({ pagos: enEfectivo(), clienteRegistrado: false }),
      { metodo: 'CREDITO', fechaDeVencimiento: '2026-10-01' },
    );
    expect(motivo).toContain('cliente registrado');
  });

  it('exige fecha de vencimiento para pasar a crédito', () => {
    const motivo = porQueNoSePuedeCambiar(venta({ pagos: enEfectivo() }), {
      metodo: 'CREDITO',
    });
    expect(motivo).toContain('fecha de vencimiento');
  });

  it('un solo método repetido en dos pagos sí se puede', () => {
    expect(
      porQueNoSePuedeCambiar(
        venta({
          pagos: [
            { id: 'a', metodo: 'EFECTIVO', montoCentavos: 500_000 },
            { id: 'b', metodo: 'EFECTIVO', montoCentavos: 808_000 },
          ],
        }),
        { metodo: 'TRANSFERENCIA' },
      ),
    ).toBeNull();
  });
});

describe('qué hay que mover', () => {
  it('de efectivo a transferencia solo cambia la fila del pago', () => {
    expect(
      planDelCambio(venta({ pagos: enEfectivo() }), {
        metodo: 'TRANSFERENCIA',
      }),
    ).toEqual({
      hacer: 'cambiar-el-metodo-del-pago',
      pagos: ['pago-1'],
      metodo: 'TRANSFERENCIA',
    });
  });

  it('de efectivo a crédito borra el pago y abre la deuda', () => {
    expect(
      planDelCambio(venta({ pagos: enEfectivo() }), {
        metodo: 'CREDITO',
        fechaDeVencimiento: '2026-10-01',
      }),
    ).toEqual({
      hacer: 'volverla-credito',
      pagosQueSeBorran: ['pago-1'],
      carteraQueRevive: null,
      totalCentavos: 1_308_000,
    });
  });

  it('revive la cartera que la venta ya tuvo, no crea otra', () => {
    const plan = planDelCambio(
      venta({
        pagos: enEfectivo(),
        cartera: aCredito({ totalCentavos: 0 }),
      }),
      { metodo: 'CREDITO', fechaDeVencimiento: '2026-10-01' },
    );
    expect(plan).toMatchObject({
      hacer: 'volverla-credito',
      carteraQueRevive: 'ar-1',
    });
  });

  it('de crédito a efectivo salda la cartera y cobra', () => {
    expect(
      planDelCambio(venta({ cartera: aCredito() }), { metodo: 'EFECTIVO' }),
    ).toEqual({
      hacer: 'cobrarla-ya',
      carteraQueSeSalda: 'ar-1',
      metodo: 'EFECTIVO',
      totalCentavos: 1_308_000,
    });
  });

  it('una venta sin cobrar solo cambia de intención', () => {
    expect(
      planDelCambio(venta({ cobrada: false, intencion: 'EFECTIVO' }), {
        metodo: 'TRANSFERENCIA',
      }),
    ).toEqual({ hacer: 'solo-la-intencion', metodo: 'TRANSFERENCIA' });
  });

  it('una venta sin cobrar que pasa a crédito sí abre la deuda', () => {
    expect(
      planDelCambio(venta({ cobrada: false, intencion: 'EFECTIVO' }), {
        metodo: 'CREDITO',
        fechaDeVencimiento: '2026-10-01',
      }),
    ).toMatchObject({ hacer: 'volverla-credito', pagosQueSeBorran: [] });
  });

  it('una venta que figura cobrada sin fila de pago se cobra ahora', () => {
    expect(
      planDelCambio(venta({ cobrada: true }), { metodo: 'EFECTIVO' }),
    ).toEqual({
      hacer: 'cobrarla-ya',
      carteraQueSeSalda: null,
      metodo: 'EFECTIVO',
      totalCentavos: 1_308_000,
    });
  });

  it('pedir el método que ya tiene no mueve nada', () => {
    expect(
      planDelCambio(venta({ pagos: enEfectivo() }), { metodo: 'EFECTIVO' }),
    ).toMatchObject({ hacer: 'nada' });
    expect(
      planDelCambio(venta({ cartera: aCredito() }), {
        metodo: 'CREDITO',
        fechaDeVencimiento: '2026-10-01',
      }),
    ).toMatchObject({ hacer: 'nada' });
  });
});

describe('la cartera que ya recibió abonos', () => {
  it('no se puede revivir', () => {
    const motivo = porQueNoSePuedeCambiar(
      venta({
        pagos: enEfectivo(),
        cartera: aCredito({ totalCentavos: 0, abonadoCentavos: 500_000 }),
      }),
      { metodo: 'CREDITO', fechaDeVencimiento: '2026-10-01' },
    );
    expect(motivo).toContain('$5.000');
    expect(motivo).toContain('revisión manual');
  });
});
