import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { RegistroDeTiempos } from './registro-de-tiempos.service.js';
import { rutaSinIdentificadores } from './percentiles.js';

/**
 * Mide cuánto tarda cada petición y deja constancia de las lentas.
 *
 * El tiempo que mide es el del servidor: desde que la petición entra hasta que
 * la respuesta sale. No incluye la red ni el navegador, y esa distinción es
 * justo la que hace falta —si el servidor contesta en 60 ms y el usuario ve
 * cuatro segundos, el problema está en el otro lado y no hay que tocar el
 * backend—.
 */
const LENTO_MS = Number(process.env.LOG_LENTITUD_MS ?? 1000);

@Injectable()
export class TiemposInterceptor implements NestInterceptor {
  private readonly log = new Logger('Tiempos');

  constructor(private readonly registro: RegistroDeTiempos) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    if (contexto.getType() !== 'http') return siguiente.handle();
    const empezo = Date.now();
    const peticion = contexto.switchToHttp().getRequest<Request>();

    return siguiente.handle().pipe(
      tap({
        next: () => this.anotar(peticion, empezo),
        error: () => this.anotar(peticion, empezo),
      }),
    );
  }

  private anotar(peticion: Request, empezo: number): void {
    const ms = Date.now() - empezo;
    // La ruta declarada (`/pos/sales/:id`) cuando existe; si no, la de verdad
    // con los identificadores fuera, para no abrir una fila por factura.
    const patron = (peticion.route as { path?: string } | undefined)?.path;
    const ruta = patron
      ? `${peticion.baseUrl ?? ''}${patron}`
      : rutaSinIdentificadores(peticion.originalUrl.split('?')[0]);
    this.registro.anotar(`${peticion.method} ${ruta}`, ms);
    if (ms >= LENTO_MS) {
      this.log.warn(`${peticion.method} ${ruta} tardó ${ms} ms`);
    }
  }
}
