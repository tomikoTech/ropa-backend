import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity.js';
import { PromotionsService } from './promotions.service.js';
import { PromotionsController } from './promotions.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Promotion])],
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
