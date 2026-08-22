import {
  cierreQueBloquea,
  motivoDelBloqueo,
  puedeCerrarse,
  type CierreDeTurno,
  type ContextoDeTurno,
} from './turno.js';

/**
 * El cierre del turno.
 *
 * Nace de «los vendedores estaban vendiendo y liquidando a las 10 de la
 * noche»: cerrado el turno, esa persona no vende ni presta más en ese local
 * hasta el día siguiente.
 *
 * La regla que manda sobre todas: **dejar a alguien sin poder vender por un
 * cierre mal hecho es peor que el problema que resuelve.** Por eso el bloqueo
 * es lo más estrecho posible (esa persona, ese local, ese día), se abre solo
 * al cambiar el día, y un administrador puede reabrirlo a mano.
 */

const cierre = (over: Partial<CierreDeTurno> = {}): CierreDeTurno => ({
  id: over.id ?? 'c1',
  localId: 'local-1',
  usuarioId: 'ana',
  dia: '2026-08-22',
  reabiertoEn: null,
  ...over,
});

const ctx = (over: Partial<ContextoDeTurno> = {}): ContextoDeTurno => ({
  habilitado: true,
  localId: 'local-1',
  usuarioId: 'ana',
  dia: '2026-08-22',
  ...over,
});

describe('cierreQueBloquea', () => {
  it('sin cierres, se puede vender', () => {
    expect(cierreQueBloquea([], ctx())).toBeNull();
  });

  it('cerrado hoy en este local: bloquea', () => {
    expect(cierreQueBloquea([cierre()], ctx())?.id).toBe('c1');
  });

  it('el cierre de ayer no bloquea hoy: el turno se reabre solo al día siguiente', () => {
    // Es la mitad del trato. Sin esto, cerrar el sábado dejaría a la tienda sin
    // vender el domingo y alguien tendría que estar reabriendo a mano cada día.
    expect(cierreQueBloquea([cierre({ dia: '2026-08-21' })], ctx())).toBeNull();
  });

  it('el cierre de otro vendedor no bloquea al que sigue trabajando', () => {
    // En un local factura más de una persona. Cerrar el turno de Ana no puede
    // dejar a Beto sin cobrar la venta que tiene en el mostrador.
    expect(cierreQueBloquea([cierre({ usuarioId: 'beto' })], ctx())).toBeNull();
  });

  it('el cierre en otro local no bloquea: cada cajón es suyo', () => {
    expect(
      cierreQueBloquea([cierre({ localId: 'local-2' })], ctx()),
    ).toBeNull();
  });

  it('un cierre reabierto deja de bloquear', () => {
    // La válvula de escape: el administrador reabre y la tienda sigue.
    const reabierto = cierre({ reabiertoEn: new Date('2026-08-22T20:00:00Z') });
    expect(cierreQueBloquea([reabierto], ctx())).toBeNull();
  });

  it('si se cerró otra vez después de reabrir, vuelve a bloquear', () => {
    const cierres = [
      cierre({ id: 'viejo', reabiertoEn: new Date('2026-08-22T20:00:00Z') }),
      cierre({ id: 'nuevo' }),
    ];
    expect(cierreQueBloquea(cierres, ctx())?.id).toBe('nuevo');
  });

  it('con la función apagada no bloquea nada, aunque haya cierres', () => {
    // Es opcional por tienda y viene apagada. Una tienda que la prueba, la
    // apaga y se queda con un cierre viejo escrito no puede quedar trancada.
    expect(cierreQueBloquea([cierre()], ctx({ habilitado: false }))).toBeNull();
  });
});

describe('motivoDelBloqueo', () => {
  it('dice qué pasó y cómo se sale, no solo que no se puede', () => {
    const msg = motivoDelBloqueo(cierre());
    expect(msg).toContain('2026-08-22');
    expect(msg.toLowerCase()).toContain('administrador');
  });
});

describe('puedeCerrarse', () => {
  it('un día sin cierre previo se puede cerrar', () => {
    expect(puedeCerrarse([], ctx())).toEqual({ ok: true });
  });

  it('no se cierra dos veces el mismo turno', () => {
    const r = puedeCerrarse([cierre()], ctx());
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('ya está cerrado');
  });

  it('tras reabrir se puede volver a cerrar', () => {
    const reabierto = cierre({ reabiertoEn: new Date('2026-08-22T20:00:00Z') });
    expect(puedeCerrarse([reabierto], ctx())).toEqual({ ok: true });
  });

  it('no se cierra un día que todavía no llega', () => {
    // Cerrar el turno de mañana dejaría a alguien sin vender mañana temprano,
    // y nadie entendería por qué.
    const r = puedeCerrarse([], ctx({ dia: '2026-08-23' }), '2026-08-22');
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('todavía no');
  });

  it('sí se cierra un día pasado que quedó abierto', () => {
    // Se olvidó cerrar el viernes; el lunes se cuadra igual.
    expect(puedeCerrarse([], ctx({ dia: '2026-08-21' }), '2026-08-22')).toEqual(
      {
        ok: true,
      },
    );
  });

  it('con la función apagada no se cierra nada', () => {
    const r = puedeCerrarse([], ctx({ habilitado: false }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('no está activo');
  });
});
