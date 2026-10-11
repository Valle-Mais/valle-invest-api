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

- Toda rota exige `Authorization: Bearer <jwt>`. O guard é global (`JwtAuthGuard` em `app.module.ts`); rotas públicas levam `@Public()`. Hoje são: `GET /`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password` e, durante a transição, `POST /auth/request-link` e `POST /auth/verify-token`.
- Papéis: `admin` e `client`. Rotas marcadas com `@Roles('admin')` recusam cliente com 403.
- Cliente só acessa os próprios dados em `GET /clients/:id`, `GET /performance/:clientId`, `GET /client-transactions` e `GET /client-transactions/:id` (`assertOwnership` em `src/auth/ownership.ts`). Em `POST /client-transactions/request`, o `clientId` vem do token, não do body.
- Não existe registro público. Usuários são criados por um admin em `POST /clients`, que dispara o convite de primeiro acesso por email.
- As rotas públicas de `/auth/*` têm rate limit de 5 requisições por minuto por IP; o resto da API, 120.
- Todos os DTOs rodam com `whitelist` e `forbidNonWhitelisted`: campo fora do DTO retorna 400.

### Login com senha

| Rota | Quem | O que faz |
|---|---|---|
| `POST /auth/login` `{ email, password }` | público | Devolve `{ access_token, user }`. 401 genérico para email ou senha errados. 403 com `code: "MUST_SET_PASSWORD"` se o usuário ainda não definiu senha |
| `POST /auth/forgot-password` `{ email }` | público | Sempre 200. Se o email existir, envia link de redefinição (1 h). Quem nunca definiu senha recebe o convite (7 dias) |
| `POST /auth/reset-password` `{ token, password }` | público | Aceita token de convite ou de redefinição, grava o hash, invalida os demais tokens do usuário |
| `GET /auth/me` | autenticado | Usuário atual, sem `passwordHash` |
| `PATCH /auth/password` `{ currentPassword, newPassword }` | autenticado | Exige a senha atual |
| `POST /auth/invite/resend` `{ userId }` | admin | Reenvia o convite de primeiro acesso |
| `PATCH /auth/profile` `{ phone? }` | autenticado | Dados de contato do próprio usuário |

- Senhas: bcrypt custo 12 (`src/auth/password.ts`). Política: 8+ caracteres com letra e número. `passwordHash` nunca sai em resposta (`src/users/user.sanitizer.ts`).
- Tokens de email: coleção `authTokens`, documento identificado pelo SHA-256 do token, uso único, com tipo `invite`, `reset` ou `magic` (`src/auth/auth-tokens.service.ts`).
- Emails: `src/mail/` (Resend). Links usam `origin` do pedido ou `FRONTEND_URL`. **Em produção, `FRONTEND_URL` precisa apontar para o front publicado**, senão o convite criado pelo admin leva para `localhost`.
- Migração dos usuários existentes para senha, uma vez, no cutover:

```bash
npm run seed -- --task=invite-all
```

Marca todos com `mustSetPassword` e envia o convite, com pausa entre envios por causa do rate limit do Resend.

## Operações do fundo

- `POST /fund-operations/preview { resultado, data? }` (admin) simula o rateio e devolve `patrimonioBase`, `taxa` e a lista por cliente, sem gravar.
- `POST /fund-operations` sem `resultado` usa `valorVenda - valorInvestido`.
- Rateio (Fase 1.5): participa de uma operação quem já estava na base quando ela foi registrada: transações aprovadas de dias anteriores, mais as do mesmo dia aprovadas antes da hora de registro da operação (`approvedAt` da transação vs `createdAt` da operação; documentos antigos usam o `createTime` do Firestore). Cliente criado depois da operação não entra nela, mesmo no mesmo dia. Cada rendimento guarda `operationId` e `taxa`; a operação guarda `patrimonioBase` e `taxa`. Criar, editar ou excluir uma operação, ou aprovar um aporte/resgate com data anterior a alguma operação, reprocessa em ordem cronológica tudo a partir da data afetada, numa única transação. Regras e funções puras em `src/fund-operations/rateio.ts`.
- Depois de mudar o motor (ou para corrigir rendimentos gerados pelo motor antigo), reconstruir todos os rendimentos, primeiro em staging:

```bash
npm run seed -- --task=rebuild-yields
```

Imprime o saldo de cada cliente antes e depois.
- `GET /performance/admin/summary?periodo=mes|6m|ano|inicio` traz `kpis.fluxoLiquidoMes` e `kpis.pendentes`.
- `GET /client-transactions` aceita `clientId`, `status`, `startDate`, `endDate`, `include=operation` e `limit`; com `clientId` devolve `saldoApos`.

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
