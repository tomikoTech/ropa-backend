import {
  dondeEstaElBulto,
  noExisteEseCodigo,
  type RastroDelBulto,
} from './donde-esta-el-bulto.js';

const rastro = (parcial: Partial<RastroDelBulto> = {}): RastroDelBulto => ({
  codigo: '26090800010040019',
  esCaja: true,
  estado: 'IN_STOCK',
  bodega: 'AMAWAD',
  venta: null,
  ...parcial,
});

const laVenta = (parcial = {}) => ({
  numero: 'VTA-20260908-0005',
  fecha: '8 de septiembre',
  cliente: 'CESAR MD MD',
  anulada: false,
  ...parcial,
});

describe('dónde está este código', () => {
  it('disponible, dice en qué bodega', () => {
    expect(dondeEstaElBulto(rastro())).toBe(
      'La caja 26090800010040019 está disponible en AMAWAD.',
    );
  });

  it('vendida, nombra la factura y la salida', () => {
    const texto = dondeEstaElBulto(
      rastro({ estado: 'SOLD', venta: laVenta() }),
    );
    expect(texto).toContain('VTA-20260908-0005');
    expect(texto).toContain('8 de septiembre');
    expect(texto).toContain('CESAR MD MD');
    // Lo que faltaba: qué hacer con la caja en la mano.
    expect(texto).toContain('quítala de esa factura');
  });

  it('vendida sin factura que la reclame, lo dice en vez de callarlo', () => {
    const texto = dondeEstaElBulto(rastro({ estado: 'SOLD' }));
    expect(texto).toContain('ninguna factura la reclama');
    expect(texto).toContain('edición a medias');
  });

  it('vendida en una factura anulada: el código debería estar libre', () => {
    const texto = dondeEstaElBulto(
      rastro({ estado: 'SOLD', venta: laVenta({ anulada: true }) }),
    );
    expect(texto).toContain('anulada');
    expect(texto).toContain('debería estar libre');
  });

  it('un par dice «el par», no «la caja»', () => {
    expect(
      dondeEstaElBulto(rastro({ esCaja: false, estado: 'WRITTEN_OFF' })),
    ).toBe('El par 26090800010040019 fue dada de baja.');
  });

  it('una caja abierta manda a escanear el par', () => {
    expect(dondeEstaElBulto(rastro({ estado: 'SPLIT' }))).toContain(
      'Escanea el del par',
    );
  });

  it('trasladada dice a dónde', () => {
    expect(
      dondeEstaElBulto(rastro({ estado: 'TRANSFERRED', bodega: 'BODEGA 2' })),
    ).toContain('trasladada a BODEGA 2');
  });

  it('un estado que nadie previó igual se explica', () => {
    expect(dondeEstaElBulto(rastro({ estado: 'RARO' }))).toContain(
      'estado: RARO',
    );
  });

  it('un código que no existe se distingue de uno que sí', () => {
    expect(noExisteEseCodigo('123')).toContain('No hay ningún producto');
  });
});
