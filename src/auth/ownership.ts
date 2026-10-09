import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './auth-user.interface';

/**
 * Garante que um cliente só acessa os próprios dados. Admin passa sempre.
 */
export function assertOwnership(user: AuthUser, clientId: string): void {
  if (user.role === 'admin') return;
  if (user.userId !== clientId) {
    throw new ForbiddenException(
      'Você só pode acessar os seus próprios dados.',
    );
  }
}
