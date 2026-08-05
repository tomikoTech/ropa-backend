import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller.js';
import { R2Service } from './r2.service.js';

@Module({
  controllers: [UploadsController],
  providers: [R2Service],
  exports: [R2Service],
})
export class UploadsModule {}
