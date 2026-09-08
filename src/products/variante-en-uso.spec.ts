import {
  avisoDeVariantesConservadas,
  seQuedaAunqueNoVengaEnElFormulario,
} from './variante-en-uso.js';

describe('una variante con mercancía no se quita al editar el producto', () => {
  it('se queda si tiene existencias', () => {
    expect(
      seQuedaAunqueNoVengaEnElFormulario({ existencias: 49, bultosVivos: 0 }),
    ).toBe(true);
  });

  it('se queda si tiene cajas en bodega, aunque el agregado diga cero', () => {
    // El caso real: el agregado se había ido a cero y las cajas seguían ahí,
    // con su código impreso.
    expect(
      seQuedaAunqueNoVengaEnElFormulario({ existencias: 0, bultosVivos: 3 }),
    ).toBe(true);
  });

  it('se puede quitar si no tiene nada', () => {
    expect(
      seQuedaAunqueNoVengaEnElFormulario({ existencias: 0, bultosVivos: 0 }),
    ).toBe(false);
  });

  it('un negativo no cuenta como mercancía', () => {
    expect(
      seQuedaAunqueNoVengaEnElFormulario({ existencias: -5, bultosVivos: 0 }),
    ).toBe(false);
  });
});

describe('el aviso', () => {
  it('sin variantes conservadas no dice nada', () => {
    expect(avisoDeVariantesConservadas([])).toBeNull();
  });

  it('nombra la variante y qué hacer', () => {
    const aviso = avisoDeVariantesConservadas(['AMAMAY5-MULTICOLOR'])!;
    expect(aviso).toContain('AMAMAY5-MULTICOLOR');
    expect(aviso).toContain('inventario');
  });

  it('en plural las lista todas', () => {
    const aviso = avisoDeVariantesConservadas(['A-1', 'B-2'])!;
    expect(aviso).toContain('A-1, B-2');
  });
});
