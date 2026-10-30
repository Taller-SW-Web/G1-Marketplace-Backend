import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../http/api-error';
import { CookieRequest, G7SessionService } from './g7-session.service';
import { G7Client, record } from './g7.client';
import { RecoveryDto, RegistrationDto, ResetPasswordDto } from './account.dto';

export type PasswordPolicy = { longitudMinima: number; requiereMayuscula: boolean; requiereMinuscula: boolean;
  requiereDigito: boolean; requiereCaracterEspecial: boolean; historial: number;
  rechazaComunes?: boolean; rechazaDatosPersonales?: boolean };
export function parsePolicy(value: unknown): PasswordPolicy | null {
  if (!record(value) || !Number.isInteger(value.longitudMinima) || Number(value.longitudMinima) < 1
    || Number(value.longitudMinima) > 256 || !Number.isInteger(value.historial) || Number(value.historial) < 0) return null;
  const booleans = ['requiereMayuscula', 'requiereMinuscula', 'requiereDigito', 'requiereCaracterEspecial'] as const;
  if (booleans.some(name => typeof value[name] !== 'boolean')) return null;
  const result = { longitudMinima: value.longitudMinima, historial: value.historial,
    ...Object.fromEntries(booleans.map(name => [name, value[name]])) } as PasswordPolicy;
  for (const name of ['rechazaComunes', 'rechazaDatosPersonales'] as const) {
    if (value[name] !== undefined && typeof value[name] !== 'boolean') return null;
    if (typeof value[name] === 'boolean') result[name] = value[name];
  }
  return result;
}

@Injectable()
export class AccountService {
  constructor(private readonly config: ConfigService, private readonly g7: G7Client, private readonly sessions: G7SessionService) {}
  capabilities() {
    return { login: this.sessions.enabled(), registro: this.sessions.enabled() && this.config.get('G7_REGISTRATION_ENABLED') === 'true',
      recuperacion: this.sessions.enabled() && this.config.get('G7_RECOVERY_ENABLED') === 'true' };
  }
  private gate(operation: 'registro' | 'recuperacion', request: CookieRequest) {
    this.sessions.assertOrigin(request);
    if (!this.capabilities()[operation]) throw new ApiError(503, 'AUTH_OPERATION_UNAVAILABLE', 'Esta operación aún no está disponible.');
  }
  async policy() {
    if (!this.sessions.enabled()) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Política no disponible.');
    const policy = parsePolicy(await this.g7.call('password/politica', undefined, undefined, 200));
    if (!policy) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Política no disponible.');
    return policy;
  }
  async register(input: RegistrationDto, request: CookieRequest) {
    this.gate('registro', request);
    const value = await this.g7.call('auth/registro', { ...input, nombres: input.nombres.trim(), apellidos: input.apellidos.trim(),
      correo: input.correo.trim(), canalOrigen: 'MARKETPLACE' }, undefined, 201);
    if (!record(value) || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.id)
      || value.estado !== 'PENDIENTE_VERIFICACION') throw new ApiError(503, 'AUTH_UNAVAILABLE', 'No pudimos confirmar la solicitud de registro.');
    return { id: value.id, estado: 'PENDIENTE_VERIFICACION' };
  }
  async recover(input: RecoveryDto, request: CookieRequest) {
    this.gate('recuperacion', request);
    try { await this.g7.call('password/recuperar', { correo: input.correo.trim() }, undefined, 202); }
    catch (error) {
      if (error instanceof ApiError && error.getStatus() === 429) {
        const body = error.getResponse();
        throw new ApiError(429, 'DEMASIADAS_SOLICITUDES', 'Espera antes de volver a solicitar instrucciones.', {
          retryAfterSeconds: record(body) && typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
        });
      }
      // The contract only defines 202 and 429. Any other provider answer (even a 400) could vary by
      // account, so it is never forwarded: recovery has no per-account response besides the neutral 429.
      if (error instanceof ApiError) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Acceso no disponible temporalmente.');
      throw error;
    }
    // No account lookup, local email storage, or different response for unknown accounts.
  }
  async reset(input: ResetPasswordDto, request: CookieRequest) {
    this.gate('recuperacion', request);
    await this.g7.call('password/restablecer', { token: input.token, nuevaContrasena: input.nuevaContrasena }, undefined, 204);
    // G7 owns token consumption and revocation of the affected user's sessions.
    // A 204 has no target UUID; never infer identity from a client-supplied field.
  }
}
