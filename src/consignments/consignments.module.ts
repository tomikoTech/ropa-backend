import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsignmentsService } from './consignments.service.js';
import { ConsignmentsController } from './consignments.controller.js';
import { Consignment } from './entities/consignment.entity.js';
import { ThirdPartyProduct } from './entities/third-party-product.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Consignment, ThirdPartyProduct])],
  controllers: [ConsignmentsController],
  providers: [ConsignmentsService],
  exports: [ConsignmentsService],
})
export class ConsignmentsModule {}
