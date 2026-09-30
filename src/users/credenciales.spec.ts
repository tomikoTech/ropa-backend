import {
  normalizarUsuario,
  porQueNoSirveElUsuario,
  porQueNoSirveLaClave,
} from './credenciales.js';

/**
 * Entrar con usuario, y poder cambiarlo.
 *
 * La tienda no entra con correo: en el mostrador nadie teclea
 * `vendedor-amawad@gmail.com` veinte veces al día, y varias de las personas
 * que venden no tienen correo propio.
 */

describe('normalizarUsuario', () => {
  it('guarda en minúsculas: el celular pone mayúscula sola', () => {
    expect(normalizarUsuario('Andres')).toBe('andres');
  });

  it('quita los espacios de los lados y de en medio', () => {
    expect(normalizarUsuario('  andres martinez ')).toBe('andresmartinez');
  });

  it('quita las tildes en vez de rechazar la palabra', () => {
    // «josé» entra como «jose», que es lo que iba a teclear de todos modos.
    expect(normalizarUsuario('José')).toBe('jose');
  });
});

describe('porQueNoSirveElUsuario', () => {
  it('acepta lo normal', () => {
    expect(porQueNoSirveElUsuario('andres')).toBeNull();
    expect(porQueNoSirveElUsuario('local_214')).toBeNull();
    expect(porQueNoSirveElUsuario('caja.1')).toBeNull();
  });

  it('rechaza el que lleva arroba: eso es un correo', () => {
    // El login acepta correo **o** usuario en el mismo campo: con arroba no
    // habría forma de distinguirlos.
    expect(porQueNoSirveElUsuario('andres@amawad.com')).toContain('arroba');
  });

  it('pide un mínimo de letras', () => {
    expect(porQueNoSirveElUsuario('ab')).toContain('3');
  });

  it('no deja nombres larguísimos', () => {
    expect(porQueNoSirveElUsuario('a'.repeat(31))).toContain('30');
  });

  it('rechaza los símbolos que no se pueden dictar por teléfono', () => {
    expect(porQueNoSirveElUsuario('andres!')).toContain('letras, números');
    expect(porQueNoSirveElUsuario('andres/martinez')).toContain('letras, números');
  });

  it('el vacío pide que se escriba algo', () => {
    expect(porQueNoSirveElUsuario('   ')).toContain('Escribe');
  });
});

describe('porQueNoSirveLaClave', () => {
  it('acepta una contraseña normal', () => {
    expect(porQueNoSirveLaClave('amawad2026')).toBeNull();
  });

  it('exige el mismo mínimo que el alta de usuarios', () => {
    expect(porQueNoSirveLaClave('12345')).toContain('6');
  });

  it('no deja poner la misma de ahora', () => {
    // Cambiar por la misma es creer que se cambió y no haber cambiado nada.
    expect(
      porQueNoSirveLaClave('lamisma1', { actual: 'lamisma1' }),
    ).toContain('igual a la de ahora');
  });

  it('no deja que la contraseña sea el usuario', () => {
    expect(
      porQueNoSirveLaClave('andres', { usuario: 'Andres' }),
    ).toContain('igual al usuario');
  });

  it('sin contraseña, lo dice', () => {
    expect(porQueNoSirveLaClave('')).toContain('Escribe');
  });
});
