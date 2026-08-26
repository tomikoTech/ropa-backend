import { Controller, Post, Body, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Límite estricto: 10 intentos por minuto y por IP. Un humano que se
  // equivoca no llega ahí; un ataque de fuerza bruta, que necesita miles por
  // segundo, se queda sin margen. El freno global (200/min) es demasiado laxo
  // para esto, así que login y refresh llevan el suyo propio.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // El registro de usuarios internos ya no vive aquí: se hace desde
  // `POST /users`, que exige ser administrador y ata el usuario a un tenant.
  // El antiguo `POST /auth/register` era público y creaba un usuario sin
  // tenant —una cuenta que cualquiera podía abrir en el backend—.

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Refrescar token de acceso' })
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión' })
  logout(@CurrentUser() user: User) {
    return this.authService.logout(user.id);
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  getProfile(@CurrentUser() user: User) {
    return this.authService.getProfile(user.id, user.tenantId);
  }

  // Se pide autenticado (por cabecera) y devuelve un token de 60 s para abrir
  // una descarga sin exponer el de sesión en la URL. Ver `ticket-de-descarga`.
  @Post('download-ticket')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Emitir un ticket de descarga de corta duración' })
  downloadTicket(@CurrentUser() user: User) {
    return this.authService.emitirTicketDescarga(user);
  }
}
