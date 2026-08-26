import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service.js';
import { ticketValidoParaLaPeticion } from '../ticket-de-descarga.js';

interface PayloadJwt {
  sub: string;
  email?: string;
  scope?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      // Aceptar el token desde el header Authorization (uso normal) o desde el
      // query param `token` (descargas vía window.open, que no puede enviar
      // headers). Por el query solo se admite el ticket de descarga; ver abajo.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
      // Hace falta la petición para saber si el token vino por la URL: un
      // access token normal no puede entrar por ahí, solo el ticket de descarga.
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: PayloadJwt) {
    // Un access token puesto en `?token=` queda en logs e historial. Por la URL
    // solo pasa el ticket de descarga (scope propio, 60 s); lo demás se rechaza
    // aunque la firma sea válida.
    if (!ticketValidoParaLaPeticion(req, payload)) {
      throw new UnauthorizedException('Este enlace de descarga no es válido.');
    }

    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inactivo o no encontrado');
    }
    return user;
  }
}
