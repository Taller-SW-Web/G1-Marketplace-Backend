import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ApiError } from '../http/api-error';
import { AuthGuard } from '../security/auth.guard';

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  identity: { customerId: string };
}

export abstract class IdentityPort {
  abstract authenticate(token: string): Promise<{ customerId: string }>;
}

@Injectable()
export class SandboxIdentityAdapter extends IdentityPort {
  constructor(private readonly authentication: AuthGuard) { super(); }

  async authenticate(token: string): Promise<{ customerId: string }> {
    try {
      return { customerId: (await this.authentication.authenticate(token)).sub };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Autenticación no disponible');
      }
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
