/**
 * Validação das variáveis de ambiente no boot.
 * A API não sobe sem as obrigatórias, em vez de falhar na primeira requisição.
 */
const REQUIRED = [
  'JWT_SECRET',
  'FIREBASE_CREDENTIALS_BASE64',
  'RESEND_API_KEY',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}. ` +
        'Veja o .env.example.',
    );
  }

  if (String(config.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');
  }

  return config;
}
