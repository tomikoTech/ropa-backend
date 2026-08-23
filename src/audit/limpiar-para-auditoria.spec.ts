import { limpiarParaAuditoria } from './limpiar-para-auditoria.js';

/**
 * Qué se puede guardar en la bitácora y qué no.
 *
 * El interceptor guardaba **el cuerpo entero de cada petición**, sin mirar qué
 * traía. En producción eso dejó, durante cinco meses: 293 contraseñas en texto
 * plano de 13 usuarios, 900 tokens de sesión, los secretos de la pasarela de
 * pagos y el token de WhatsApp. Cualquiera con lectura a la base —o a un
 * respaldo— los tenía.
 *
 * Y aparte, 90 de los 96 MB de la tabla eran **fotos de productos en base64**,
 * duplicadas de las que ya están en R2.
 *
 * La bitácora sirve para saber **quién hizo qué y cuándo**. Para eso no hace
 * falta el valor de una clave, y basta con saber que el campo venía.
 */
describe('limpiarParaAuditoria', () => {
  it('tapa la contraseña pero deja constancia de que venía', () => {
    // La que importa. Borrar la clave entera escondería que el intento de
    // entrar traía una; taparla conserva el hecho sin el secreto.
    expect(
      limpiarParaAuditoria({ email: 'a@b.co', password: 'lo-que-sea' }),
    ).toEqual({ email: 'a@b.co', password: '[oculto]' });
  });

  it('tapa tokens y secretos, se llamen como se llamen', () => {
    expect(
      limpiarParaAuditoria({
        refreshToken: 'x',
        accessToken: 'y',
        wompiEventsSecret: 'z',
        whatsappAccessToken: 'w',
        adminPassword: 'v',
        apiKey: 'u',
      }),
    ).toEqual({
      refreshToken: '[oculto]',
      accessToken: '[oculto]',
      wompiEventsSecret: '[oculto]',
      whatsappAccessToken: '[oculto]',
      adminPassword: '[oculto]',
      apiKey: '[oculto]',
    });
  });

  it('no le importan las mayúsculas ni los guiones', () => {
    expect(
      limpiarParaAuditoria({ 'X-Api-Key': 'x', CLAVE: 'y', pin_code: 'z' }),
    ).toEqual({ 'X-Api-Key': '[oculto]', CLAVE: '[oculto]', pin_code: '[oculto]' });
  });

  it('quita las fotos en base64 y dice cuántas eran', () => {
    // 90 de los 96 MB de la tabla. Ya están en R2: guardarlas otra vez acá no
    // le sirve a nadie y multiplica el peso de cada respaldo.
    expect(
      limpiarParaAuditoria({
        name: 'Tenis',
        images_base64: [{ data: 'AAAA' }, { data: 'BBBB' }],
      }),
    ).toEqual({ name: 'Tenis', images_base64: '[2 imagen(es) omitida(s)]' });
  });

  it('baja hasta el fondo: un secreto anidado también se tapa', () => {
    // Los cuerpos reales vienen anidados; mirar solo el primer nivel dejaría
    // pasar justo los de configuración.
    expect(
      limpiarParaAuditoria({
        tienda: { nombre: 'X', pasarela: { wompiIntegritySecret: 's' } },
      }),
    ).toEqual({
      tienda: { nombre: 'X', pasarela: { wompiIntegritySecret: '[oculto]' } },
    });
  });

  it('y dentro de una lista', () => {
    expect(
      limpiarParaAuditoria({ usuarios: [{ email: 'a@b.co', password: 'x' }] }),
    ).toEqual({ usuarios: [{ email: 'a@b.co', password: '[oculto]' }] });
  });

  it('lo que no es sensible se conserva tal cual', () => {
    // La bitácora tiene que seguir sirviendo: si tapáramos todo, no habría
    // forma de saber qué cambió.
    const cuerpo = {
      nombre: 'Tenis',
      precio: 100000,
      activo: true,
      talla: null,
      tallas: ['38', '39'],
    };
    expect(limpiarParaAuditoria(cuerpo)).toEqual(cuerpo);
  });

  it('un texto larguísimo se recorta y se avisa', () => {
    // Una foto puede llegar como cadena suelta, sin llamarse `base64`. El
    // tope es lo único que protege de eso.
    const largo = 'a'.repeat(50_000);
    const limpio = limpiarParaAuditoria({ nota: largo }) as {
      nota: string;
    };
    expect(limpio.nota.length).toBeLessThan(2_000);
    expect(limpio.nota).toContain('recortado');
  });

  it('sin cuerpo no inventa uno', () => {
    expect(limpiarParaAuditoria(undefined)).toBeUndefined();
    expect(limpiarParaAuditoria(null)).toBeUndefined();
  });

  it('un cuerpo que no es un objeto no revienta', () => {
    // La bitácora nunca puede tumbar la petición que está auditando.
    expect(limpiarParaAuditoria('texto suelto' as never)).toBeUndefined();
    expect(limpiarParaAuditoria(42 as never)).toBeUndefined();
  });

  it('una estructura que se referencia a sí misma no cuelga el proceso', () => {
    const a: Record<string, unknown> = { nombre: 'x' };
    a.yo = a;
    expect(() => limpiarParaAuditoria(a)).not.toThrow();
  });

  it('no toca el cuerpo original: la petición sigue su curso', () => {
    // Se audita **después** de responder, pero el objeto es el mismo que usó
    // el controlador. Mutarlo sería cambiar la petición por auditarla.
    const cuerpo = { email: 'a@b.co', password: 'secreta' };
    limpiarParaAuditoria(cuerpo);
    expect(cuerpo.password).toBe('secreta');
  });
});
