import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promoter } from './promoter.entity.js';
import { PromotersController } from './promoters.controller.js';
import { PromotersService } from './promoters.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Promoter])],
  controllers: [PromotersController],
  providers: [PromotersService],
  exports: [TypeOrmModule],
})
export class PromotersModule {}
