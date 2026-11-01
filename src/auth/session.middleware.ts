import { Injectable, NestMiddleware } from '@nestjs/common';
import { ApiError } from '../http/api-error';
import { CookieRequest, G7SessionService } from './g7-session.service';

type Request = CookieRequest & { originalUrl: string; method: string; headers: CookieRequest['headers'] & { authorization?: string } };
type Response = { status(code: number): Response; json(value: unknown): unknown };

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly sessions: G7SessionService) {}
  async use(request: Request, response: Response, next: () => void) {
    if (!this.sessions.enabled() || !/^\/api\/(?:v1\/(wishlist|carts|checkout|orders)|cart)(\/|\?|$)/.test(request.originalUrl)
      || request.headers.authorization !== undefined || !this.sessions.cookie(request)) return next();
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) this.sessions.assertOrigin(request);
      const data = await this.sessions.access(this.sessions.cookie(request));
      if (!data) throw new ApiError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.');
      request.headers.authorization = `Bearer ${data.tokens.accessToken}`;
      next();
    } catch (error) {
      if (error instanceof ApiError) response.status(error.getStatus()).json(error.getResponse());
      else response.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'Acceso no disponible temporalmente.' });
    }
  }
}
