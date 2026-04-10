import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EcommerceCustomer } from '../entities/ecommerce-customer.entity.js';

interface CustomerJwtPayload {
  sub: string;
  email: string;
  type: string;
  tenantId: string;
}

@Injectable()
export class JwtCustomerStrategy extends PassportStrategy(Strategy, 'jwt-customer') {
  constructor(
    configService: ConfigService,
    @InjectRepository(EcommerceCustomer)
    private readonly customerRepo: Repository<EcommerceCustomer>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: CustomerJwtPayload) {
    if (payload.type !== 'customer') {
      throw new UnauthorizedException('Token no válido para clientes');
    }

    const customer = await this.customerRepo.findOne({
      where: { id: payload.sub },
    });

    if (!customer || !customer.isActive) {
      throw new UnauthorizedException('Cliente inactivo o no encontrado');
    }

    return customer;
  }
}
