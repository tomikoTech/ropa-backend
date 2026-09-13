import {
  resolverDestino,
  nombreDelDestino,
} from './destino-de-la-cesion.js';

/**
 * A quién se le cede la mercancía.
 *
 * La cesión presta mercancía que sigue siendo del origen: vuelve como plata o
 * como devolución. Antes solo se le cedía a un patinador; ahora también a una
 * bodega u otro local, y en los dos sentidos.
 *
 * Un destino torcido descuadra el inventario sin que nadie lo note hasta el
 * conteo, así que la regla se prueba sola.
 */

const ORIGEN = 'bodega-principal';

describe('resolverDestino', () => {
  it('a una persona, con su patinador', () => {
    expect(
      resolverDestino({ tipo: 'PERSONA', personaId: 'p1', bodegaOrigenId: ORIGEN }),
    ).toEqual({ tipo: 'PERSONA', personaId: 'p1', bodegaId: null });
  });

  it('a una bodega, con su bodega', () => {
    expect(
      resolverDestino({ tipo: 'BODEGA', bodegaId: 'local-2', bodegaOrigenId: ORIGEN }),
    ).toEqual({ tipo: 'BODEGA', personaId: null, bodegaId: 'local-2' });
  });

  it('sirve al revés: un local le presta a la principal', () => {
    // «Sirve bidireccional». No hace falta nada especial: es el mismo
    // formulario con el origen y el destino cambiados.
    expect(
      resolverDestino({
        tipo: 'BODEGA',
        bodegaId: ORIGEN,
        bodegaOrigenId: 'local-2',
      }),
    ).toEqual({ tipo: 'BODEGA', personaId: null, bodegaId: ORIGEN });
  });

  it('una bodega no se presta a sí misma', () => {
    // Saldría del inventario y volvería al mismo sitio: no mueve nada y deja
    // una deuda que nadie va a cobrar.
    const r = resolverDestino({
      tipo: 'BODEGA',
      bodegaId: ORIGEN,
      bodegaOrigenId: ORIGEN,
    });
    expect(r.error).toBe(
      'La bodega de origen y la de destino no pueden ser la misma.',
    );
  });

  it('sin persona elegida, lo dice con esas palabras', () => {
    expect(
      resolverDestino({ tipo: 'PERSONA', bodegaOrigenId: ORIGEN }).error,
    ).toBe('Elige a quién se le entrega la mercancía.');
  });

  it('sin bodega elegida, también', () => {
    expect(
      resolverDestino({ tipo: 'BODEGA', bodegaId: '  ', bodegaOrigenId: ORIGEN })
        .error,
    ).toBe('Elige a qué bodega o local se le entrega la mercancía.');
  });

  it('lo que quedó en la otra pestaña se ignora, no se rechaza', () => {
    // El formulario recuerda lo que se eligió antes de cambiar de pestaña, y
    // eso no es un error de nadie: manda el tipo elegido.
    expect(
      resolverDestino({
        tipo: 'PERSONA',
        personaId: 'p1',
        bodegaId: 'local-2',
        bodegaOrigenId: ORIGEN,
      }),
    ).toEqual({ tipo: 'PERSONA', personaId: 'p1', bodegaId: null });
  });

  it('un tipo que no existe no se cuela', () => {
    const r = resolverDestino({
      tipo: 'OTRA_COSA' as 'PERSONA',
      personaId: 'p1',
      bodegaOrigenId: ORIGEN,
    });
    expect(r.error).toBe('Elige si la cesión va a una persona o a una bodega.');
  });
});

describe('nombreDelDestino', () => {
  it('el nombre de la bodega', () => {
    expect(
      nombreDelDestino({
        destinoTipo: 'BODEGA',
        bodegaDestino: { name: 'Local Centro' },
      }),
    ).toBe('Local Centro');
  });

  it('el nombre de la persona', () => {
    expect(
      nombreDelDestino({ destinoTipo: 'PERSONA', persona: { name: 'Andrés' } }),
    ).toBe('Andrés');
  });

  it('las cesiones viejas, sin tipo, se leen igual', () => {
    // Antes de que existieran las bodegas todas eran a un patinador. Salir
    // vacías haría ilegible el historial.
    expect(nombreDelDestino({ persona: { name: 'Andrés' } })).toBe('Andrés');
  });
});
