import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { ModeloDeLenguaje } from './modelo-de-lenguaje.js';

@Module({
  imports: [ReportsModule, AccessModule],
  controllers: [AssistantController],
  providers: [AssistantService, ModeloDeLenguaje],
})
export class AssistantModule {}
