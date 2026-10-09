import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthUser } from './auth-user.interface';

function contextWith(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const admin: AuthUser = { userId: 'a1', email: 'a@x.com', role: 'admin' };
  const client: AuthUser = { userId: 'c1', email: 'c@x.com', role: 'client' };

  function guardRequiring(roles?: string[]) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('libera rota sem @Roles para qualquer usuário autenticado', () => {
    expect(guardRequiring(undefined).canActivate(contextWith(client))).toBe(
      true,
    );
  });

  it('libera admin em rota @Roles(admin)', () => {
    expect(guardRequiring(['admin']).canActivate(contextWith(admin))).toBe(
      true,
    );
  });

  it('bloqueia cliente em rota @Roles(admin) com 403', () => {
    expect(() =>
      guardRequiring(['admin']).canActivate(contextWith(client)),
    ).toThrow(ForbiddenException);
  });

  it('responde 401 se não houver usuário no request', () => {
    expect(() =>
      guardRequiring(['admin']).canActivate(contextWith(undefined)),
    ).toThrow(UnauthorizedException);
  });
});
