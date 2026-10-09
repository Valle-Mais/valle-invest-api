export type UserRole = 'admin' | 'client';

/** Usuário autenticado, montado pelo JwtStrategy a partir do payload do token. */
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}
