import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  NotFoundException,
} from '@nestjs/common';

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
}

@Catch(NotFoundException)
export class NotFoundFilter implements ExceptionFilter<NotFoundException> {
  catch(_exception: NotFoundException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const body = _exception.getResponse();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'object'
    ) {
      response.status(_exception.getStatus()).json(body);
      return;
    }
    response.status(404).json({ error: 'Ruta no encontrada' });
  }
}
