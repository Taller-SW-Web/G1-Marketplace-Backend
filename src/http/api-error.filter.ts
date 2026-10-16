import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ApiError } from './api-error';

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    if (error instanceof ApiError) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    const status = error instanceof HttpException ? error.getStatus() : 500;
    // Preserve the shared baseline's route-not-found contract.
    if (status === 404) {
      response.status(404).json({ error: 'Ruta no encontrada' });
      return;
    }
    const codes: Record<number, string> = { 400: 'INVALID_REQUEST', 401: 'UNAUTHORIZED', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE' };
    const publicStatus = status >= 400 && status < 500 ? status : 500;
    if (publicStatus === 500) this.logger.error('Request failed: internal error');
    response.status(publicStatus).json({
      code: codes[publicStatus] ?? 'INTERNAL_ERROR',
      message: publicStatus === 500 ? 'Error interno del servicio' : 'Solicitud rechazada',
    });
  }
}
