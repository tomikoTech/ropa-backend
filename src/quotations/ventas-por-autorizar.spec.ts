import {
  rotulosDeVentasPendientes,
  soloLasSuyas,
} from './ventas-por-autorizar.js';

describe('rotulosDeVentasPendientes', () => {
  it('quien vende lee que es suya y que todavía no descuenta', () => {
    const r = rotulosDeVentasPendientes({ puedeAutorizar: false });
    expect(r.titulo).toBe('Mis ventas por autorizar');
    expect(r.subtitulo).toMatch(/todavía no descuenta/i);
  });

  it('quien autoriza lee que espera su visto bueno', () => {
    const r = rotulosDeVentasPendientes({ puedeAutorizar: true });
    expect(r.titulo).toBe('Ventas por autorizar');
    expect(r.subtitulo).toMatch(/tu visto bueno/i);
  });

  it('los dos rótulos son distintos: es el punto', () => {
    const vende = rotulosDeVentasPendientes({ puedeAutorizar: false });
    const autoriza = rotulosDeVentasPendientes({ puedeAutorizar: true });
    expect(vende.titulo).not.toBe(autoriza.titulo);
    expect(vende.vacio).not.toBe(autoriza.vacio);
    expect(vende.crear).not.toBe(autoriza.crear);
  });

  it('ninguno dice «cotización»', () => {
    // Quien ya cerró el trato con el cliente no está cotizando.
    for (const quien of [{ puedeAutorizar: true }, { puedeAutorizar: false }]) {
      const r = rotulosDeVentasPendientes(quien);
      for (const texto of Object.values(r)) {
        expect(texto.toLowerCase()).not.toContain('cotiza');
      }
    }
  });
});

describe('soloLasSuyas', () => {
  it('quien no autoriza ve solo las propias', () => {
    // `findAll` devolvía todas las del tenant: un vendedor externo vería los
    // pedidos de los demás, con sus clientes y sus precios.
    expect(soloLasSuyas({ puedeAutorizar: false }, 'u1')).toBe('u1');
  });

  it('quien autoriza las ve todas: es su trabajo', () => {
    expect(soloLasSuyas({ puedeAutorizar: true }, 'u1')).toBeNull();
  });
});
