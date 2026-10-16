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
    response.status(404).json({ error: 'Ruta no encontrada' });
  }
}
