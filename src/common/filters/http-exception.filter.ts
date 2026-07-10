import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

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
      console.error('Unhandled exception:', exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
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
