import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { EcommerceCustomer } from './entities/ecommerce-customer.entity.js';
import { EcommerceOrder } from './entities/ecommerce-order.entity.js';
import { StoreSettings } from './entities/store-settings.entity.js';
import { CustomerRegisterDto } from './dto/customer-register.dto.js';
import { CustomerLoginDto } from './dto/customer-login.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto.js';

@Injectable()
export class CustomerAuthService {
  private googleClient: OAuth2Client;

  constructor(
    @InjectRepository(EcommerceCustomer)
    private readonly customerRepo: Repository<EcommerceCustomer>,
    @InjectRepository(EcommerceOrder)
    private readonly orderRepo: Repository<EcommerceOrder>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const googleClientId = this.configService.get<string>('google.clientId');
    this.googleClient = new OAuth2Client(googleClientId);
  }

  /** Resolve tenantSlug to tenantId */
  private async resolveTenantId(tenantSlug: string): Promise<string> {
    const settings = await this.settingsRepo.findOne({
      where: { storeSlug: tenantSlug, isStorefrontActive: true },
    });
    if (!settings) {
      throw new NotFoundException('Tienda no encontrada');
    }
    return settings.tenantId;
  }

  /** Register a new customer with email + password */
  async register(tenantSlug: string, dto: CustomerRegisterDto) {
    const tenantId = await this.resolveTenantId(tenantSlug);

    const existing = await this.customerRepo.findOne({
      where: { tenantId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const customer = this.customerRepo.create({
      tenantId,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      passwordHash,
      addresses: dto.address ? [dto.address] : [],
    });

    await this.customerRepo.save(customer);

    // Link existing guest orders by email
    await this.orderRepo.update(
      { tenantId, customerEmail: dto.email, customerId: null as any },
      { customerId: customer.id },
    );

    return this.generateTokens(customer);
  }

  /** Login with email + password */
  async login(tenantSlug: string, dto: CustomerLoginDto) {
    const tenantId = await this.resolveTenantId(tenantSlug);

    const customer = await this.customerRepo.findOne({
      where: { tenantId, email: dto.email },
    });
    if (!customer || !customer.passwordHash) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!customer.isActive) {
      throw new UnauthorizedException('Cuenta desactivada');
    }

    return this.generateTokens(customer);
  }

  /** Google OAuth login / register */
  async googleLogin(tenantSlug: string, dto: GoogleLoginDto) {
    const tenantId = await this.resolveTenantId(tenantSlug);

    const googleClientId = this.configService.get<string>('google.clientId');
    const ticket = await this.googleClient.verifyIdToken({
      idToken: dto.idToken,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedException('Token de Google inválido');
    }

    let customer = await this.customerRepo.findOne({
      where: { tenantId, email: payload.email },
    });

    if (customer) {
      // Link Google ID if not already linked
      if (!customer.googleId) {
        customer.googleId = payload.sub;
        await this.customerRepo.save(customer);
      }
    } else {
      // Create new customer from Google data
      customer = this.customerRepo.create({
        tenantId,
        email: payload.email,
        firstName: payload.given_name ?? '',
        lastName: payload.family_name ?? '',
        googleId: payload.sub,
      });
      await this.customerRepo.save(customer);

      // Link existing guest orders
      await this.orderRepo.update(
        { tenantId, customerEmail: payload.email, customerId: null as any },
        { customerId: customer.id },
      );
    }

    if (!customer.isActive) {
      throw new UnauthorizedException('Cuenta desactivada');
    }

    return this.generateTokens(customer);
  }

  /** Get customer profile */
  async getProfile(customerId: string) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      addresses: customer.addresses,
      createdAt: customer.createdAt,
    };
  }

  /** Update customer profile */
  async updateProfile(customerId: string, dto: UpdateCustomerProfileDto) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (dto.firstName !== undefined) customer.firstName = dto.firstName;
    if (dto.lastName !== undefined) customer.lastName = dto.lastName;
    if (dto.phone !== undefined) customer.phone = dto.phone;
    if (dto.addresses !== undefined) customer.addresses = dto.addresses;

    await this.customerRepo.save(customer);

    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      addresses: customer.addresses,
    };
  }

  /** Get customer's orders */
  async getMyOrders(customerId: string, tenantSlug: string) {
    const tenantId = await this.resolveTenantId(tenantSlug);

    return this.orderRepo.find({
      where: { customerId, tenantId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Refresh access token using a valid refresh token */
  async refreshToken(tenantSlug: string, refreshToken: string) {
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');

    let payload: { sub: string; email: string; type: string; tenantId: string };
    try {
      payload = this.jwtService.verify(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Token de refresco inválido o expirado');
    }

    if (payload.type !== 'customer') {
      throw new UnauthorizedException('Token no válido para clientes');
    }

    const tenantId = await this.resolveTenantId(tenantSlug);
    if (payload.tenantId !== tenantId) {
      throw new UnauthorizedException('Token no válido para esta tienda');
    }

    const customer = await this.customerRepo.findOne({
      where: { id: payload.sub, tenantId },
    });
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException('Cliente inactivo o no encontrado');
    }

    return this.generateTokens(customer);
  }

  /** Generate access + refresh tokens */
  private generateTokens(customer: EcommerceCustomer) {
    const payload = {
      sub: customer.id,
      email: customer.email,
      type: 'customer',
      tenantId: customer.tenantId,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiration') as any,
    });

    return {
      accessToken,
      refreshToken,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        addresses: customer.addresses,
      },
    };
  }
}
