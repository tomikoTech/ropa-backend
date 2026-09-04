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

  /**
   * Cuántos milisegundos después de rotar un refresh token se sigue aceptando.
   *
   * El refresh es de un solo uso: al usarlo se revoca y se emite uno nuevo. Pero
   * el POS abre varias pestañas/dispositivos y, cuando el access token vence, se
   * dispara más de un refresh a la vez; además una respuesta de refresh se puede
   * perder por red justo después de que el servidor ya revocó el viejo. En esos
   * casos el cliente se queda con un token recién revocado y, sin gracia, el
   * siguiente intento lo sacaría a login **sin haber hecho nada malo**. Con la
   * gracia, un token rotado hace pocos segundos todavía refresca; uno viejo no.
   */
  private static readonly GRACIA_ROTACION_MS = 60_000;

  async refreshTokens(refreshToken: string) {
    // Se busca sin filtrar por `is_revoked`: hace falta distinguir "no existe"
    // de "revocado hace un momento" (gracia) de "revocado hace rato" (fuera).
    const tokenEntity = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken },
      relations: ['user'],
    });

    const ahora = new Date();
    if (!tokenEntity || tokenEntity.expiresAt < ahora) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (tokenEntity.isRevoked) {
      // Solo entra a la gracia lo revocado por ROTACIÓN (tiene `revokedAt`).
      // Un token revocado por cierre de sesión no tiene `revokedAt` → se
      // rechaza: cerrar sesión debe llevar a login de verdad.
      const revocadoHaceMs = tokenEntity.revokedAt
        ? ahora.getTime() - new Date(tokenEntity.revokedAt).getTime()
        : Infinity;
      if (revocadoHaceMs > AuthService.GRACIA_ROTACION_MS) {
        throw new UnauthorizedException('Refresh token inválido o expirado');
      }
      // Dentro de la gracia: no se vuelve a revocar (ya lo está); se emite un
      // par nuevo para que la sesión siga viva.
      return this.generateTokens(tokenEntity.user);
    }

    // Rotación normal: revocar el viejo (con marca de tiempo para la gracia).
    tokenEntity.isRevoked = true;
    tokenEntity.revokedAt = ahora;
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
