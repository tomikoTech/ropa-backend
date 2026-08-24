import { necesitaCotizaciones } from './lo-que-el-perfil-necesita.js';
import { findRoleTemplate } from './role-templates.js';

const perfil = (p: Record<string, Partial<Record<string, boolean>>>) =>
  Object.entries(p).map(([module, a]) => ({
    module,
    list: !!a.list,
    create: !!a.create,
    edit: !!a.edit,
    delete: !!a.delete,
  }));

describe('qué necesita encendido un perfil para servir de algo', () => {
  // El dueño crea un «Vendedor externo» y le sale «El módulo de Cotizaciones
  // no está habilitado para esta tienda». No tiene por qué saber que el
  // interruptor que le falta se llama Cotizaciones.
  it('el que pide autorización necesita cotizaciones', () => {
    expect(
      necesitaCotizaciones(
        perfil({ vender: { list: true }, sales: { list: true } }),
      ),
    ).toBe(true);
  });

  it('el que cobra directo, no: no manda nada a autorizar', () => {
    expect(
      necesitaCotizaciones(
        perfil({ vender: { list: true }, sales: { list: true, create: true } }),
      ),
    ).toBe(false);
  });

  it('quien no usa la pantalla simplificada, no', () => {
    expect(necesitaCotizaciones(perfil({ sales: { list: true } }))).toBe(false);
  });

  it('un rol vacío no enciende nada', () => {
    expect(necesitaCotizaciones([])).toBe(false);
  });

  // Las plantillas reales, para que esto no se desincronice con ellas.
  it('la plantilla de vendedor externo lo necesita', () => {
    expect(
      necesitaCotizaciones(findRoleTemplate('vendedor-externo')!.permissions),
    ).toBe(true);
  });

  it('la del que cobra directo, no', () => {
    expect(
      necesitaCotizaciones(findRoleTemplate('vendedor-directo')!.permissions),
    ).toBe(false);
  });

  it('la de cajero tampoco', () => {
    expect(necesitaCotizaciones(findRoleTemplate('cajero')!.permissions)).toBe(
      false,
    );
  });
});
