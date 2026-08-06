import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { describePgError } from '../utils/db-errors.util.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        message = (exceptionResponse as any).message || exception.message;
      }
    } else if (this.isPayloadTooLarge(exception)) {
      // body-parser lanza PayloadTooLargeError cuando el JSON supera el límite.
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message =
        'El cuerpo de la solicitud es demasiado grande (máx 20MB). Reduce el tamaño de las imágenes.';
    } else {
      // Errores de PostgreSQL (duplicados, FK, tipos): se traducen a 4xx con un
      // mensaje accionable en vez de un 500 opaco. Se sigue logueando con
      // contexto porque casi siempre indican un hueco de validación en el
      // servicio que debería atraparlo antes de llegar a la base de datos.
      const dbError = describePgError(exception);
      if (dbError) {
        status = dbError.status;
        message = dbError.message;
        this.logger.warn(
          `${this.describeRequest(request)} -> ${status}: ${this.errorDetail(exception)}`,
        );
      } else {
        this.logger.error(
          `${this.describeRequest(request)} -> 500 no controlado`,
          exception instanceof Error ? exception.stack : String(exception),
        );
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  // Contexto mínimo para poder rastrear el error en los logs de producción:
  // método, ruta y tenant/usuario cuando el request ya pasó por el guard.
  private describeRequest(request: Request | undefined): string {
    if (!request) return 'petición desconocida';
    const user = (request as any).user as
      | { tenantId?: string; id?: string }
      | undefined;
    const who = user?.tenantId
      ? ` tenant=${user.tenantId}${user.id ? ` user=${user.id}` : ''}`
      : '';
    return `${request.method} ${request.originalUrl ?? request.url}${who}`;
  }

  private errorDetail(exception: unknown): string {
    if (typeof exception !== 'object' || exception === null) {
      return String(exception);
    }
    const e = exception as { code?: string; detail?: string; message?: string };
    return [e.code, e.detail ?? e.message].filter(Boolean).join(' ');
  }

  private isPayloadTooLarge(exception: unknown): boolean {
    if (typeof exception !== 'object' || exception === null) return false;
    const e = exception as {
      type?: string;
      status?: number;
      statusCode?: number;
    };
    return (
      e.type === 'entity.too.large' || e.status === 413 || e.statusCode === 413
    );
  }
}
