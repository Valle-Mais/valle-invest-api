/**
 * Remove campos que nunca podem sair em resposta da API.
 * Usar em todo retorno de documento da coleção `users`.
 */
export type PublicUser<T> = Omit<T, 'passwordHash'>;

export function stripSensitive<T extends { passwordHash?: unknown }>(
  user: T,
): PublicUser<T> {
  const { passwordHash: _omit, ...rest } = user;
  void _omit;
  return rest;
}
