import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../auth-user.interface';

export const ROLES_KEY = 'roles';

/** Restringe a rota (ou o controller inteiro) aos papéis informados. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
