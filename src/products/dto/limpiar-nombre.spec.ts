import { plainToInstance } from 'class-transformer';
import { CreateProductDto } from './create-product.dto.js';
import { UpdateProductDto } from './update-product.dto.js';

describe('el nombre del producto llega limpio', () => {
  it('sin espacios a los lados ni dobles adentro, al crear y al editar', () => {
    expect(
      plainToInstance(CreateProductDto, { name: ' LIGHT  BLUE ' }).name,
    ).toBe('LIGHT BLUE');
    expect(
      plainToInstance(UpdateProductDto, { name: 'NAUTICA VOYAGE \t' }).name,
    ).toBe('NAUTICA VOYAGE');
  });

  it('editar sin mandar nombre no lo inventa', () => {
    expect(plainToInstance(UpdateProductDto, {}).name).toBeUndefined();
  });
});
