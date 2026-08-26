/**
 * Si los secretos de firma sirven para arrancar en producción.
 *
 * `configuration.ts` cae a `'default-secret'` / `'default-refresh-secret'`
 * cuando la variable no está: en local es comodidad, pero esos valores viven
 * en el repositorio, así que un entorno de producción que arranque sin
 * `JWT_SECRET` quedaría firmando tokens con un secreto público —cualquiera
 * forjaría uno con el `sub` del admin—. Aquí se decide, sin arrancar Nest, si
 * eso pasa; el arranque lo aborta si `ok` es falso en producción.
 */

/** Los fallbacks que viven en `configuration.ts`. Nunca válidos en producción. */
const DEFAULTS_DEL_REPO = new Set(['default-secret', 'default-refresh-secret']);

/** Por debajo de esto un secreto se adivina por fuerza bruta offline. */
const LARGO_MINIMO = 32;

export interface RevisionDeSecretos {
  ok: boolean;
  errores: string[];
  advertencias: string[];
}

interface EnvDeSecretos {
  JWT_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
}

function revisarUno(
  nombre: string,
  valor: string | undefined,
  errores: string[],
): void {
  if (!valor) {
    errores.push(`${nombre} no está definida.`);
    return;
  }
  if (DEFAULTS_DEL_REPO.has(valor)) {
    errores.push(
      `${nombre} tiene el valor por defecto del repositorio; ponle un secreto propio.`,
    );
    return;
  }
  if (valor.length < LARGO_MINIMO) {
    errores.push(
      `${nombre} es demasiado corta (${valor.length}); usa al menos ${LARGO_MINIMO} caracteres.`,
    );
  }
}

export function revisarSecretos(
  env: EnvDeSecretos,
  esProduccion: boolean,
): RevisionDeSecretos {
  const errores: string[] = [];
  const advertencias: string[] = [];

  // Fuera de producción no se bloquea nada: el dev local corre con los
  // defaults. Pero se avisa, porque esconderlo es lo que hace que un default se
  // cuele a producción sin que nadie lo note.
  if (!esProduccion) {
    for (const [nombre, valor] of [
      ['JWT_SECRET', env.JWT_SECRET],
      ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
    ] as const) {
      if (valor && DEFAULTS_DEL_REPO.has(valor)) {
        advertencias.push(
          `${nombre} usa el valor por defecto (${valor}); solo válido en local.`,
        );
      }
    }
    return { ok: true, errores, advertencias };
  }

  revisarUno('JWT_SECRET', env.JWT_SECRET, errores);
  revisarUno('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET, errores);

  // Reusar el mismo secreto para acceso y refresh anula la diferencia: un
  // refresh token robado firmaría access tokens y viceversa.
  if (
    env.JWT_SECRET &&
    env.JWT_REFRESH_SECRET &&
    env.JWT_SECRET === env.JWT_REFRESH_SECRET
  ) {
    errores.push('JWT_SECRET y JWT_REFRESH_SECRET no pueden ser iguales.');
  }

  return { ok: errores.length === 0, errores, advertencias };
}
