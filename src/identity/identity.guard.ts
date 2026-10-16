import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../http/api-error';
import { verifySandboxToken } from './sandbox-token';

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  identity: { customerId: string };
}

export abstract class IdentityPort {
  abstract authenticate(token: string): Promise<{ customerId: string }>;
}

@Injectable()
export class SandboxIdentityAdapter extends IdentityPort {
  constructor(private readonly config: ConfigService) { super(); }

  async authenticate(token: string): Promise<{ customerId: string }> {
    if (!this.config.get<boolean>('H3_SANDBOX_ENABLED', false)) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Autenticación requerida');
    }
    try {
      return { customerId: verifySandboxToken(token, this.config.getOrThrow<string>('H3_JWT_SECRET')) };
    } catch {
      throw new ApiError(401, 'UNAUTHORIZED', 'Autenticación requerida');
    }
  }
}

@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly identity: IdentityPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = typeof authorization === 'string' ? /^Bearer ([^\s]+)$/i.exec(authorization) : null;
    if (!match) throw new ApiError(401, 'UNAUTHORIZED', 'Autenticación requerida');
    request.identity = await this.identity.authenticate(match[1]);
    return true;
  }
}
