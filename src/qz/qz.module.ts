import { Module } from '@nestjs/common';
import { QzController } from './qz.controller.js';

@Module({ controllers: [QzController] })
export class QzModule {}
