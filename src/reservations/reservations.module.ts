import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from './entities/reservation.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { ReservationsService } from './reservations.service.js';
import { ReservationsController } from './reservations.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, Stock, StoreSettings])],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
