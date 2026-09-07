import { BadRequestException } from '@nestjs/common';
import { createVerify, generateKeyPairSync } from 'crypto';
import { QzController } from './qz.controller.js';

/**
 * La firma es lo que le permite a la tienda decirle a QZ Tray «recordar esta
 * decisión» y no volver a ver el aviso en cada impresión. Si la firma no
 * verifica, QZ la rechaza y el aviso vuelve.
 */
describe('QzController', () => {
  const ctrl = new QzController();
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const conLlave = <T>(fn: () => T): T => {
    process.env.QZ_PRIVATE_KEY = pem;
    try {
      return fn();
    } finally {
      delete process.env.QZ_PRIVATE_KEY;
    }
  };

  afterEach(() => {
    delete process.env.QZ_CERTIFICATE;
    delete process.env.QZ_PRIVATE_KEY;
  });

  it('sin certificado configurado, no devuelve ninguno (se sigue sin firmar)', () => {
    expect(ctrl.certificate()).toEqual({ certificate: null });
  });

  it('devuelve el certificado, con los saltos de línea reales', () => {
    process.env.QZ_CERTIFICATE = '-----BEGIN CERT-----\\nabc\\n-----END CERT-----';
    expect(ctrl.certificate().certificate).toBe(
      '-----BEGIN CERT-----\nabc\n-----END CERT-----',
    );
  });

  it('sin llave privada no firma (la aplicación sigue funcionando)', () => {
    expect(ctrl.sign({ data: 'hola' })).toEqual({ signature: null });
  });

  it('la firma verifica con la llave pública', () => {
    const datos = 'qz-request-1788727000';
    const { signature } = conLlave(() => ctrl.sign({ data: datos }));
    expect(signature).toBeTruthy();
    const ok = createVerify('SHA512')
      .update(datos)
      .verify(publicKey, signature!, 'base64');
    expect(ok).toBe(true);
  });

  it('una firma no sirve para otro texto', () => {
    const { signature } = conLlave(() => ctrl.sign({ data: 'texto A' }));
    const ok = createVerify('SHA512')
      .update('texto B')
      .verify(publicKey, signature!, 'base64');
    expect(ok).toBe(false);
  });

  it('rechaza una petición vacía o desmedida', () => {
    conLlave(() => {
      expect(() => ctrl.sign({})).toThrow(BadRequestException);
      expect(() => ctrl.sign({ data: '' })).toThrow(BadRequestException);
      expect(() => ctrl.sign({ data: 'x'.repeat(4097) })).toThrow(
        BadRequestException,
      );
    });
  });
});
