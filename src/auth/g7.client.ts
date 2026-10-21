import { Injectable } from '@nestjs/common';
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
  constructor(private readonly config: ConfigService) {}

  async call(path: string, body?: unknown, token?: string): Promise<unknown> {
    let response: Response;
    try {
      const base = new URL(this.config.getOrThrow<string>('G7_API_URL'));
      const local = ['localhost', '127.0.0.1'].includes(base.hostname);
      if (base.username || base.password || base.search || base.hash
        || (base.protocol !== 'https:' && !(base.protocol === 'http:' && local
          && this.config.get('NODE_ENV') !== 'production'))) throw new Error('Invalid G7 URL');
      response = await fetch(`${base.href.replace(/\/$/, '')}/${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(this.config.get<number>('HTTP_TIMEOUT_MS', 5000)),
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Acceso no disponible temporalmente.'); }
    if (response.status === 204) return null;
    let result: unknown;
    try { result = await response.json(); } catch {
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Respuesta de acceso no disponible.');
    }
    if (!response.ok) {
      const codes: Record<number, string[]> = {
        401: ['CREDENCIALES_INVALIDAS', 'CODIGO_INVALIDO', 'OTP_INTENTOS_AGOTADOS', 'TOKEN_INVALIDO', 'REFRESCO_INVALIDO'],
        403: ['PASSWORD_CADUCADA'], 410: ['OTP_EXPIRADO'], 429: ['RATE_LIMITED'],
      };
      // Only forward contract codes. Provider messages can contain account data.
      const error = record(result) && record(result.error) ? result.error : result;
      const code = record(error) && typeof error.code === 'string' ? error.code : '';
      if (response.status === 429) throw new ApiError(429, 'RATE_LIMITED', 'Espera antes de volver a intentarlo.');
      if (codes[response.status]?.includes(code)) throw new ApiError(response.status, code, 'No pudimos completar el acceso.');
      if (response.status === 401) throw new ApiError(401, 'CREDENCIALES_INVALIDAS', 'No pudimos completar el acceso.');
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Acceso no disponible temporalmente.');
    }
    return result;
  }
}
