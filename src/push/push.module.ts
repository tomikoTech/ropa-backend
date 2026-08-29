import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from './entities/push-subscription.entity.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

/**
 * Web Push. Exporta el servicio para que Notificaciones dispare el push además
 * del aviso en la app.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
