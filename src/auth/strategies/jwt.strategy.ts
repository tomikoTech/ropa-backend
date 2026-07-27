import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      // Aceptar el token desde el header Authorization (uso normal) o desde el
      // query param `token` (descargas vía window.open, que no puede enviar
      // headers): exports de reportes y estados de cuenta.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inactivo o no encontrado');
    }
    return user;
  }
}
