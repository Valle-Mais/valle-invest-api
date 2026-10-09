import { ForbiddenException } from '@nestjs/common';
import { assertOwnership } from './ownership';
import { AuthUser } from './auth-user.interface';

describe('assertOwnership', () => {
  const admin: AuthUser = { userId: 'a1', email: 'a@x.com', role: 'admin' };
  const client: AuthUser = { userId: 'c1', email: 'c@x.com', role: 'client' };

  it('admin acessa qualquer cliente', () => {
    expect(() => assertOwnership(admin, 'c1')).not.toThrow();
    expect(() => assertOwnership(admin, 'c2')).not.toThrow();
  });

  it('cliente acessa a si mesmo', () => {
    expect(() => assertOwnership(client, 'c1')).not.toThrow();
  });

  it('cliente não acessa outro cliente', () => {
    expect(() => assertOwnership(client, 'c2')).toThrow(ForbiddenException);
  });
});
