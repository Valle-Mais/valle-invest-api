import {
  PASSWORD_PATTERN,
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from './password';

describe('password', () => {
  it('gera hash bcrypt e valida a senha correta', async () => {
    const hash = await hashPassword('Senha123');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword('Senha123', hash)).toBe(true);
    expect(await verifyPassword('Senha124', hash)).toBe(false);
  });

  it('política exige letra e número', () => {
    expect(PASSWORD_PATTERN.test('abcdefgh')).toBe(false);
    expect(PASSWORD_PATTERN.test('12345678')).toBe(false);
    expect(PASSWORD_PATTERN.test('abcdef12')).toBe(true);
  });

  it('comparação com hash descartável sempre falha', async () => {
    expect(await verifyAgainstDummy('qualquer')).toBe(false);
  });
});
