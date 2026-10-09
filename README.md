# valle-invest-api

API da plataforma Valle Consultoria. NestJS 10 + Firestore, hospedada na Vercel.

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha as variáveis
npm run start:dev      # http://localhost:3000
```

A API não sobe sem `JWT_SECRET`, `FIREBASE_CREDENTIALS_BASE64` e `RESEND_API_KEY`. A validação acontece no boot, em `src/config/env.validation.ts`.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `FIREBASE_CREDENTIALS_BASE64` | sim | JSON da service account em base64: `base64 -i service-account.json \| tr -d '\n'` |
| `JWT_SECRET` | sim | Segredo do JWT, mínimo 32 caracteres: `openssl rand -base64 48` |
| `RESEND_API_KEY` | sim | Chave do Resend para envio de email |
| `MAIL_FROM` | não | Remetente dos emails, de um domínio verificado no Resend. Default `onboarding@resend.dev`, que só entrega para a conta Resend |
| `FRONTEND_URL` | não | URL do front usada nos links de email. Default `http://localhost:4200` |
| `FRONTEND_URLS` | não | Origens permitidas no CORS, separadas por vírgula. Default `http://localhost:4200` |
| `PORT` | não | Default `3000` |

## Autenticação e autorização

- Toda rota exige `Authorization: Bearer <jwt>`. O guard é global (`JwtAuthGuard` em `app.module.ts`); rotas públicas levam `@Public()`. Hoje são: `GET /`, `POST /auth/request-link`, `POST /auth/verify-token`.
- Papéis: `admin` e `client`. Rotas marcadas com `@Roles('admin')` recusam cliente com 403.
- Cliente só acessa os próprios dados em `GET /clients/:id`, `GET /performance/:clientId`, `GET /client-transactions` e `GET /client-transactions/:id` (`assertOwnership` em `src/auth/ownership.ts`). Em `POST /client-transactions/request`, o `clientId` vem do token, não do body.
- Não existe registro público. Usuários são criados por um admin em `POST /clients`.
- `/auth/*` tem rate limit de 5 requisições por minuto por IP; o resto da API, 120.
- Todos os DTOs rodam com `whitelist` e `forbidNonWhitelisted`: campo fora do DTO retorna 400.

## Firestore

Só a API acessa o banco, pelo Admin SDK. As regras em `firestore.rules` negam qualquer acesso de cliente e devem estar publicadas no projeto:

```bash
firebase deploy --only firestore:rules
```

## Scripts

```bash
npm run build                 # compila para dist/
npm run lint                  # eslint --fix
npm test                      # jest
npm run seed                  # ver src/seed.ts para as tasks disponíveis
```
