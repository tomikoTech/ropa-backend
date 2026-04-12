import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Optional API key guard for service-to-service authentication.
 *
 * Checks `X-Service-Key` header against `SERVICE_API_KEY` env var.
 * If SERVICE_API_KEY is not configured, allows all requests (backwards compatible).
 * Apply per-controller with @UseGuards(ServiceKeyGuard).
 */
@Injectable()
export class ServiceKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const serviceKey = this.configService.get<string>('SERVICE_API_KEY');

    // If no service key configured, allow all (backwards compatible)
    if (!serviceKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-service-key'];

    if (!providedKey || providedKey !== serviceKey) {
      throw new UnauthorizedException('Invalid or missing service key');
    }

    return true;
  }
}
