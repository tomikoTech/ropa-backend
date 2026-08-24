import { revisarSalvaguardas } from './codigos-fisicos.util.js';

/**
 * Lo que impide meterle a una tienda los códigos de otra.
 *
 * Este script escribe en producción y lo corre una persona desde su terminal,
 * a veces meses después de la última vez. Las salvaguardas son lo único que
 * hay entre un `MODE=apply` distraído y 2.742 códigos físicos en el inventario
 * equivocado —que además no se pueden borrar sin dejar rastro, porque cada uno
 * arrastra sus eventos—.
 *
 * Estaban sueltas dentro de `main()`, donde no se podían probar sin base de
 * datos. Acá se prueban sin nada.
 */

const base = {
  modo: 'apply' as const,
  slug: 'sportcali',
  confirmTenant: 'sportcali',
  checksumEsperado: 'abc123',
  confirmChecksum: 'abc123',
  filasExcluidas: 0,
  razonDeExclusion: null as string | null,
  conflictos: 0,
};

describe('revisarSalvaguardas', () => {
  it('con todo en orden, deja pasar', () => {
    expect(() => revisarSalvaguardas(base)).not.toThrow();
  });

  it('el preview nunca se bloquea: no escribe nada', () => {
    // Si el preview exigiera confirmaciones, nadie podría mirar antes de
    // decidir, que es justo para lo que existe.
    expect(() =>
      revisarSalvaguardas({
        ...base,
        modo: 'preview',
        confirmTenant: undefined,
        confirmChecksum: undefined,
        conflictos: 9,
      }),
    ).not.toThrow();
  });

  it('sin confirmar la tienda, no escribe', () => {
    // La que importa: correr el script en la carpeta equivocada le metería a
    // Sportcali los códigos de AMAWAD.
    expect(() =>
      revisarSalvaguardas({ ...base, confirmTenant: undefined }),
    ).toThrow(/CONFIRM_TENANT=sportcali/);
  });

  it('confirmar otra tienda tampoco sirve', () => {
    expect(() =>
      revisarSalvaguardas({ ...base, confirmTenant: 'amawad' }),
    ).toThrow(/CONFIRM_TENANT=sportcali/);
  });

  it('el checksum tiene que ser el del archivo que se está mirando', () => {
    // Sin esto se aprueba un preview y se aplica otro archivo: el extractor se
    // vuelve a correr y demachine ya cambió.
    expect(() =>
      revisarSalvaguardas({ ...base, confirmChecksum: 'otro' }),
    ).toThrow(/abc123/);
  });

  it('excluir referencias exige decir por qué', () => {
    // La exclusión es la decisión más fácil de olvidar y la más difícil de
    // reconstruir seis meses después.
    expect(() => revisarSalvaguardas({ ...base, filasExcluidas: 3 })).toThrow(
      /EXCLUSION_REASON/,
    );
    expect(() =>
      revisarSalvaguardas({
        ...base,
        filasExcluidas: 3,
        razonDeExclusion: '  ',
      }),
    ).toThrow(/EXCLUSION_REASON/);
  });

  it('con la razón escrita, la exclusión pasa', () => {
    expect(() =>
      revisarSalvaguardas({
        ...base,
        filasExcluidas: 3,
        razonDeExclusion: 'Referencias descontinuadas, confirmado con Cesar',
      }),
    ).not.toThrow();
  });

  it('un solo conflicto en el reporte detiene todo', () => {
    // Importar «casi todo» deja un inventario a medias que nadie sabe leer:
    // los que entraron y los que no se ven igual.
    expect(() => revisarSalvaguardas({ ...base, conflictos: 1 })).toThrow(
      /1 conflicto/,
    );
  });

  it('sin tienda no arranca', () => {
    expect(() => revisarSalvaguardas({ ...base, slug: '' })).toThrow(
      /TENANT_SLUG/,
    );
    expect(() => revisarSalvaguardas({ ...base, slug: '   ' })).toThrow(
      /TENANT_SLUG/,
    );
  });
});
