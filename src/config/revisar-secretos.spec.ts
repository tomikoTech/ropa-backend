import { revisarSecretos } from './revisar-secretos.js';

/**
 * Que el backend no arranque en producción con un secreto de firma débil.
 *
 * El fallback `'default-secret'` vive en el repositorio: si un entorno arranca
 * sin `JWT_SECRET`, cualquiera puede firmar un token con el `sub` del admin y
 * entrar a todo. En local ese fallback es comodidad; en producción es una
 * puerta abierta. Aquí se decide dónde se tolera y dónde no, sin arrancar Nest.
 */
describe('revisarSecretos', () => {
  const fuerte = 'x7Kp2mQ9vL4nR8wZ3aB6cD1eF5gH0jTq'; // 32 chars
  const otroFuerte = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';

  describe('en producción', () => {
    const prod = (env: Record<string, string | undefined>) =>
      revisarSecretos(env, true);

    it('acepta dos secretos fuertes y distintos', () => {
      const r = prod({ JWT_SECRET: fuerte, JWT_REFRESH_SECRET: otroFuerte });
      expect(r.ok).toBe(true);
      expect(r.errores).toEqual([]);
    });

    it('rechaza el secreto por defecto del repositorio', () => {
      const r = prod({
        JWT_SECRET: 'default-secret',
        JWT_REFRESH_SECRET: otroFuerte,
      });
      expect(r.ok).toBe(false);
      expect(r.errores.join(' ')).toMatch(/JWT_SECRET/);
    });

    it('rechaza el refresh por defecto', () => {
      const r = prod({
        JWT_SECRET: fuerte,
        JWT_REFRESH_SECRET: 'default-refresh-secret',
      });
      expect(r.ok).toBe(false);
      expect(r.errores.join(' ')).toMatch(/JWT_REFRESH_SECRET/);
    });

    it('rechaza un secreto ausente', () => {
      expect(prod({ JWT_REFRESH_SECRET: otroFuerte }).ok).toBe(false);
      expect(prod({ JWT_SECRET: fuerte }).ok).toBe(false);
    });

    it('rechaza un secreto corto aunque no sea el default', () => {
      // 20 caracteres se adivinan por fuerza bruta offline; 32 es el mínimo.
      const r = prod({ JWT_SECRET: 'corto-pero-no-default', JWT_REFRESH_SECRET: otroFuerte });
      expect(r.ok).toBe(false);
      expect(r.errores.join(' ')).toMatch(/JWT_SECRET/);
    });

    it('rechaza reusar el mismo secreto para acceso y refresh', () => {
      // Si son iguales, un refresh token robado firma access tokens y al revés.
      const r = prod({ JWT_SECRET: fuerte, JWT_REFRESH_SECRET: fuerte });
      expect(r.ok).toBe(false);
      expect(r.errores.join(' ')).toMatch(/iguales|mismo/i);
    });

    it('junta todos los problemas, no solo el primero', () => {
      // Quien despliega quiere ver de una vez todo lo que le falta.
      const r = prod({ JWT_SECRET: 'default-secret', JWT_REFRESH_SECRET: undefined });
      expect(r.errores.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('fuera de producción', () => {
    it('deja arrancar con los defaults, para no frenar el dev local', () => {
      const r = revisarSecretos(
        { JWT_SECRET: 'default-secret', JWT_REFRESH_SECRET: 'default-refresh-secret' },
        false,
      );
      expect(r.ok).toBe(true);
    });

    it('pero avisa de que están puestos, no lo esconde', () => {
      const r = revisarSecretos({ JWT_SECRET: 'default-secret' }, false);
      expect(r.advertencias.join(' ')).toMatch(/default/i);
    });
  });
});
