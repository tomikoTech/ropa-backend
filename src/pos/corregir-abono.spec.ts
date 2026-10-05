import { corregirAbono, type AbonoACorregir } from './corregir-abono.js';

const abono = (extra: Partial<AbonoACorregir> = {}): AbonoACorregir => ({
  centavos: 5_000_000,
  reversaA: null,
  reversado: false,
  metodo: 'EFECTIVO',
  bankId: null,
  reference: null,
  notes: null,
  ...extra,
});

describe('corregirAbono', () => {
  it('pasa un abono de efectivo a transferencia con su banco y su recibo', () => {
    const r = corregirAbono({
      abono: abono(),
      correccion: { metodo: 'TRANSFERENCIA', bankId: 'nequi', reference: 'RC-404' },
      bancosActivos: 2,
    });
    expect(r).toEqual({
      ok: true,
      cambios: { metodo: 'TRANSFERENCIA', bankId: 'nequi', reference: 'RC-404', notes: null },
    });
  });

  it('una transferencia sin banco se rechaza cuando la tienda tiene bancos', () => {
    // Si no, el abono sale de «efectivo» y no entra a ningún banco: la plata
    // desaparece del cuadre de tesorería.
    const r = corregirAbono({
      abono: abono(),
      correccion: { metodo: 'TRANSFERENCIA' },
      bancosActivos: 2,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/banco/i);
  });

  it('sin bancos configurados, la transferencia pasa sin banco', () => {
    const r = corregirAbono({
      abono: abono(),
      correccion: { metodo: 'TRANSFERENCIA' },
      bancosActivos: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.cambios.bankId).toBeNull();
  });

  it('volver a efectivo quita el banco aunque no se diga', () => {
    const r = corregirAbono({
      abono: abono({ metodo: 'TRANSFERENCIA', bankId: 'nequi' }),
      correccion: { metodo: 'EFECTIVO' },
      bancosActivos: 2,
    });
    expect(r.ok && r.cambios).toEqual({ metodo: 'EFECTIVO', bankId: null, reference: null, notes: null });
  });

  it('solo el recibo: el método y el banco se quedan como estaban', () => {
    const r = corregirAbono({
      abono: abono({ metodo: 'TRANSFERENCIA', bankId: 'nequi', notes: 'ok' }),
      correccion: { reference: '  RC-9 ' },
      bancosActivos: 2,
    });
    expect(r.ok && r.cambios).toEqual({ metodo: 'TRANSFERENCIA', bankId: 'nequi', reference: 'RC-9', notes: 'ok' });
  });

  it('un contra-abono no se corrige', () => {
    const r = corregirAbono({
      abono: abono({ centavos: -5_000_000, reversaA: 'a' }),
      correccion: { metodo: 'TRANSFERENCIA', bankId: 'nequi' },
      bancosActivos: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/deshace/i);
  });

  it('un abono ya deshecho tampoco: ya no cuenta', () => {
    const r = corregirAbono({
      abono: abono({ reversado: true }),
      correccion: { reference: 'RC-1' },
      bancosActivos: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/deshecho/i);
  });

  it('a crédito o mixto no se corrige: no son plata que entró', () => {
    const r = corregirAbono({
      abono: abono(),
      correccion: { metodo: 'CREDITO' as never },
      bancosActivos: 1,
    });
    expect(r.ok).toBe(false);
  });
});
