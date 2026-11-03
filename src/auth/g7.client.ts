import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../http/api-error';

export type G7Session = {
  accessToken: string; refreshToken: string; tokenType: 'Bearer'; expiresIn: number;
  usuario: { id: string; nombreCompleto: string; roles: string[] };
};
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class G7Client {
  private readonly logger = new Logger(G7Client.name);
  constructor(private readonly config: ConfigService) {}

  async call(path: string, body?: unknown, token?: string, expectedStatus?: number, form = false): Promise<unknown> {
    const startedAt = Date.now();
    const warn = (reason: string, status?: number) => this.logger.warn(JSON.stringify({
      event: 'g7_call_failed', path, reason, status, durationMs: Date.now() - startedAt,
    }));
    let response: Response;
    let phase = 'configuration';
    try {
      const base = new URL(this.config.getOrThrow<string>('G7_API_URL'));
      const local = ['localhost', '127.0.0.1'].includes(base.hostname);
      if (base.username || base.password || base.search || base.hash
        || (base.protocol !== 'https:' && !(base.protocol === 'http:' && local
          && this.config.get('NODE_ENV') !== 'production'))) throw new Error('Invalid G7 URL');
      phase = 'request';
      response = await fetch(`${base.href.replace(/\/$/, '')}/${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(this.config.get<number>('HTTP_TIMEOUT_MS', 5000)),
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body) } : {}),
      });
    } catch (error) {
      const kind = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout'
        : phase === 'configuration' ? 'configuration' : 'network';
      warn(kind);
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Acceso no disponible temporalmente.');
    }
    if (response.ok && expectedStatus !== undefined && response.status !== expectedStatus) {
      warn('unexpected_status', response.status);
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'No pudimos confirmar el resultado.');
    }
    if (response.status === 204 || response.status === 202 && expectedStatus === 202) return null;
    let result: unknown;
    try { result = await response.json(); } catch {
      warn('invalid_json', response.status);
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Respuesta de acceso no disponible.');
    }
    if (!response.ok) {
      const codes: Record<number, string[]> = {
        400: ['VALIDACION'],
        401: ['CREDENCIALES_INVALIDAS', 'CODIGO_INVALIDO', 'OTP_INTENTOS_AGOTADOS', 'TOKEN_INVALIDO', 'REFRESCO_INVALIDO', 'TOKEN_RECUPERACION_INVALIDO'],
        403: ['PASSWORD_CADUCADA'], 409: ['CORREO_NO_DISPONIBLE'],
        410: ['OTP_EXPIRADO', 'TOKEN_RECUPERACION_EXPIRADO'], 422: ['POLITICA_INCUMPLIDA'], 429: ['RATE_LIMITED'],
      };
      // Only forward contract codes. Provider messages can contain account data.
      const error = record(result) && record(result.error) ? result.error : result;
      const code = record(error) && typeof error.code === 'string' ? error.code : '';
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const seconds = retry && /^\d+$/.test(retry) && Number(retry) <= 86400 ? Number(retry) : undefined;
        throw new ApiError(429, 'RATE_LIMITED', 'Espera antes de volver a intentarlo.', { retryAfterSeconds: seconds });
      }
      if (codes[response.status]?.includes(code)) throw new ApiError(response.status, code, 'No pudimos completar el acceso.');
      if (response.status === 401) throw new ApiError(401, 'CREDENCIALES_INVALIDAS', 'No pudimos completar el acceso.');
      warn('unrecognized_response', response.status);
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Acceso no disponible temporalmente.');
    }
    return result;
  }
}
