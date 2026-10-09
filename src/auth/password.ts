import * as bcrypt from 'bcryptjs';

/** Política mínima: 8 caracteres, ao menos uma letra e um número. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;
export const PASSWORD_POLICY_MESSAGE =
  'A senha precisa ter ao menos 8 caracteres, com letras e números.';

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: string | undefined;

/**
 * Compara contra um hash descartável quando o usuário não existe, para que
 * "usuário não encontrado" e "senha errada" levem o mesmo tempo de resposta.
 */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  dummyHash ??= await bcrypt.hash('valle-timing-equalizer', BCRYPT_COST);
  await bcrypt.compare(plain, dummyHash);
  return false;
}
