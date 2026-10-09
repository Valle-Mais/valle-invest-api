import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = {
    JWT_SECRET: 'x'.repeat(32),
    FIREBASE_CREDENTIALS_BASE64: 'e30=',
    RESEND_API_KEY: 're_test',
  };

  it('aceita configuração completa', () => {
    expect(validateEnv(valid)).toEqual(valid);
  });

  it('falha listando as variáveis ausentes', () => {
    expect(() => validateEnv({ JWT_SECRET: valid.JWT_SECRET })).toThrow(
      /FIREBASE_CREDENTIALS_BASE64, RESEND_API_KEY/,
    );
  });

  it('falha com JWT_SECRET curto', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'curto' })).toThrow(
      /32 caracteres/,
    );
  });
});
