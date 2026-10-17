import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class OptionalAuthGuard extends AuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;

    // Si no se envía Authorization, se permite continuar como sesión anónima
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      request.user = undefined;
      return true;
    }

    // Authorization requiere validación compartida: RS256 o HS256 sandbox explícito.
    // Cualquier token adulterado, falso, expirado o malformado lanzará 401 UNAUTHENTICATED
    return super.canActivate(context);
  }
}
