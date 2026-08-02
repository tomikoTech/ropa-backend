import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsignmentsService } from './consignments.service.js';
import { ConsignmentsController } from './consignments.controller.js';
import { Consignment } from './entities/consignment.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Consignment])],
  controllers: [ConsignmentsController],
  providers: [ConsignmentsService],
  exports: [ConsignmentsService],
})
export class ConsignmentsModule {}
