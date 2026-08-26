import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { User } from '../users/entities/user.entity.js';
import {
  SCOPE_DESCARGA,
  TICKET_VIDA_SEGUNDOS,
} from './ticket-de-descarga.js';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async login(loginDto: LoginDto) {
    // `email` puede ser un email O un nombre de usuario.
    const user = await this.usersService.findByEmailOrUsername(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    return this.generateTokens(user);
  }

  async refreshTokens(refreshToken: string) {
    const tokenEntity = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken, isRevoked: false },
      relations: ['user'],
    });

    if (!tokenEntity || tokenEntity.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // Revoke old token
    tokenEntity.isRevoked = true;
    await this.refreshTokenRepository.save(tokenEntity);

    return this.generateTokens(tokenEntity.user);
  }

  async logout(userId: string) {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    return { message: 'Sesión cerrada exitosamente' };
  }

  async getProfile(userId: string, tenantId?: string) {
    return this.usersService.findOne(userId, tenantId);
  }

  /**
   * Un ticket para abrir una descarga sin poner el token de sesión en la URL.
   *
   * Vive 60 segundos y lleva `scope: download`, lo único que la estrategia JWT
   * acepta por `?token=`. Se pide justo antes de `window.open`, así que aunque
   * quede en un log de acceso, para cuando alguien lo vea ya no sirve.
   */
  emitirTicketDescarga(user: User) {
    const ticket = this.jwtService.sign(
      { sub: user.id, scope: SCOPE_DESCARGA },
      { expiresIn: `${TICKET_VIDA_SEGUNDOS}s` },
    );
    return { ticket, expiraEnSegundos: TICKET_VIDA_SEGUNDOS };
  }

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const refreshTokenEntity = this.refreshTokenRepository.create({
      token: refreshToken,
      userId: user.id,
      expiresAt,
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        /**
         * Si tiene matriz de permisos.
         *
         * Sin esto, justo despues de entrar el frontend no sabia si el usuario
         * estaba restringido y pintaba la pantalla completa —el menu, el panel
         * de inicio— uno o dos segundos, hasta que llegaba la matriz. Se ve, y
         * se alcanza a fotografiar.
         */
        accessRoleId: user.accessRoleId ?? null,
      },
    };
  }
}
