import { Module } from '@nestjs/common';
import { CarteraController } from './cartera.controller.js';
import { CarteraService } from './cartera.service.js';

/**
 * El historial de las dos carteras: lo que nos abonaron y lo que pagamos.
 *
 * Módulo propio y no un método más en POS o en Compras porque la pregunta es
 * la misma de los dos lados —«cuándo entró la plata y cuánta»— y la respuesta
 * se arma igual. Solo lee: cobrar y pagar siguen viviendo donde estaban.
 */
@Module({
  controllers: [CarteraController],
  providers: [CarteraService],
})
export class CarteraModule {}
