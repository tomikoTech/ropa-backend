import { claveFacilYAleatoria } from './clave-facil.js';

/**
 * La contraseña que se entrega con una cuenta nueva.
 *
 * Se dicta por teléfono o se manda por WhatsApp y se teclea en un celular:
 * tiene que ser fácil de escribir y aun así no adivinable.
 */
describe('claveFacilYAleatoria', () => {
  it('se puede teclear sin pelear: solo minúsculas y números', () => {
    for (let i = 0; i < 50; i++) {
      expect(claveFacilYAleatoria()).toMatch(/^[a-z]+[0-9]{3}$/);
    }
  });

  it('pasa el mínimo que exige el cambio de contraseña', () => {
    for (let i = 0; i < 50; i++) {
      expect(claveFacilYAleatoria().length).toBeGreaterThanOrEqual(6);
    }
  });

  it('no sale la misma dos veces seguidas', () => {
    // No es una garantía criptográfica: es que entregar dos cuentas con la
    // misma clave se vería como un error, y lo sería.
    const muchas = new Set(
      Array.from({ length: 200 }, () => claveFacilYAleatoria()),
    );
    expect(muchas.size).toBeGreaterThan(190);
  });
});
