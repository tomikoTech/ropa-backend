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
    /**
     * Lo que la excepción quiso decir además del mensaje.
     *
     * Hay rechazos que **no son errores**: el servidor pide una confirmación y
     * espera que la pantalla reintente. Para distinguirlos hace falta un
     * código, y el filtro lo estaba tirando —solo dejaba pasar `message`—, así
     * que la pantalla no podía saber si preguntar o mostrar un error rojo.
     *
     * Se copia todo menos lo que el filtro ya arma por su cuenta.
     */
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      // El freno por IP contesta «ThrottlerException: Too Many Requests», que
      // no le dice nada a quien está recibiendo mercancía. Se traduce a lo que
      // de verdad pasó y a qué hacer.
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        this.logger.warn(
          `${this.describeRequest(request)} -> 429 freno por IP`,
        );
        response.status(status).json({
          statusCode: status,
          message:
            'Demasiadas peticiones seguidas desde esta conexión. Espera un ' +
            'minuto y vuelve a intentarlo.',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const cuerpo = exceptionResponse as Record<string, unknown>;
        message = (cuerpo.message as string) || exception.message;
        const { message: _m, statusCode: _s, error: _e, ...resto } = cuerpo;
        extra = resto;
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

    this.registrar(status, message, request);

    response.status(status).json({
      statusCode: status,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Dejar rastro de los rechazos en el log.
   *
   * En producción no quedaba ninguno: un cliente reportó «da error 400 al
   * anexar en una venta» y los logs no tenían **nada** que mirar —solo se
   * registraban los errores de base de datos y los 500—. Un 400 es el servidor
   * diciendo algo concreto y ese algo se perdía en el camino.
   *
   * Se dejan fuera dos ruidos que no son problemas: el 401 (una sesión que
   * venció) y el 404 de un GET, que es el pan de cada día del escaneo —el
   * buscador le pregunta por un código a medio teclear y la respuesta correcta
   * es «no existe»—.
   */
  private registrar(
    status: number,
    message: string | string[],
    request: Request | undefined,
  ): void {
    if (status < 400) return;
    if (status === HttpStatus.UNAUTHORIZED) return;
    if (status === HttpStatus.NOT_FOUND && request?.method === 'GET') return;
    // Los 500 y los errores de base de datos ya se registraron arriba con su
    // traza; repetirlos solo duplicaría.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return;

    const texto = Array.isArray(message) ? message.join(' | ') : message;
    this.logger.warn(
      `${this.describeRequest(request)} -> ${status}: ${texto}`,
    );
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
