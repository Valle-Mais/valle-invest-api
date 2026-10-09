import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Libera a rota do guard JWT global. Usar só em autenticação e health check. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
