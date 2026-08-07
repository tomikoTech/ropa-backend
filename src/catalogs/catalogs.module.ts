import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Size } from './entities/size.entity.js';
import { Color } from './entities/color.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { SizesService } from './sizes.service.js';
import { SizesController } from './sizes.controller.js';
import { ColorsService } from './colors.service.js';
import { ColorsController } from './colors.controller.js';

/**
 * Catálogos transversales de variante: tallas y colores.
 *
 * Van juntos en un módulo (y en una sola pantalla con pestañas en el admin)
 * porque se administran a la vez y comparten el mismo patrón: el valor vive
 * como texto en `ProductVariant`, y el catálogo aporta el id estable que
 * necesitan las curvas de tallas y los renglones de compra por cajas.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Size, Color, ProductVariant])],
  controllers: [SizesController, ColorsController],
  providers: [SizesService, ColorsService],
  exports: [SizesService, ColorsService],
})
export class CatalogsModule {}
