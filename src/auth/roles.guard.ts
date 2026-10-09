import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser, UserRole } from './auth-user.interface';
import { ROLES_KEY } from './decorators/roles.decorator';

/**
 * Guard de papel registrado globalmente, depois do JwtAuthGuard.
 * Rotas sem @Roles() passam; com @Roles(), o papel do token precisa constar.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    return true;
  }
}
