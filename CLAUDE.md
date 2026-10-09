# CLAUDE.md

Guia para o Claude Code trabalhar neste repositório. O plano de evolução completo está em `../valle-invest-front/PLANO-IMPLEMENTACAO.md` (fases, bugs numerados, decisões pendentes). Consulte-o antes de propor mudanças estruturais.

## Comandos

```bash
npm install
cp .env.example .env     # preencher antes de subir
npm run start:dev        # http://localhost:3000, com watch
npm run build            # nest build
npm run lint             # eslint --fix em src e test
npm test                 # jest, specs em src/**/*.spec.ts
npx jest src/auth        # rodar só uma pasta
npm run seed             # tasks de manutenção, ver src/seed.ts
```

A API não sobe sem `JWT_SECRET`, `FIREBASE_CREDENTIALS_BASE64` e `RESEND_API_KEY`. A lista completa de variáveis está no README e em `.env.example`.

## Arquitetura

- NestJS 10, TypeScript, Firestore via Admin SDK (`FirebaseModule` expõe o provider `'FIRESTORE'`).
- Deploy na Vercel como função serverless (`vercel.json`). Não há estado em memória confiável entre requisições: o rate limit é por instância e caches são best effort.
- Módulos por domínio em `src/`: `auth`, `clients`, `users`, `client-transactions`, `fund-operations`, `performance`, `instruments`, `cdi`, `ibovespa`, `seeder`.
- `UsersService` e `ClientsService` operam na mesma coleção `users`. É dívida conhecida (Fase 5 do plano); não criar um terceiro serviço para a mesma coleção.
- Email pelo Resend, instanciado em `AuthService`. Remetente em `MAIL_FROM`.

### Modelo de negócio (não mudar sem ler a Fase 1.5 do plano)

- Admin registra operações do fundo (`fund_operations`) com `resultado` em R$.
- `FundOperationsService.distributeResultInTransaction` rateia o resultado entre clientes com saldo positivo, gravando transações de tipo `Rendimento` em `client_transactions` com `operationId`.
- `ClientTransactionsService.recalculateClientBalance` deriva `users.totalInvestido` das transações aprovadas. **`totalInvestido` nunca é aceito de fora da API.**
- Aporte ou resgate aprovado com data anterior a uma operação dispara `triggerReprocessingIfNecessary`, que apaga e recria rendimentos. Esse motor tem um bug conhecido (B9/B10 no plano): a base do rateio não corta pela data da operação. A correção está planejada; não "consertar" parcialmente em outro lugar.
- `PerformanceService` calcula rentabilidade, CDI (API do Banco Central) e Ibovespa (Yahoo Finance) a cada requisição. Períodos aceitos: `Mês`, `6 meses`, `Desde o início`; qualquer outro valor vira 12 meses.

## Autenticação e autorização

- `JwtAuthGuard`, `RolesGuard` e `ThrottlerGuard` são globais (`APP_GUARD` em `app.module.ts`), nessa ordem.
- Toda rota nova é protegida por padrão. Para abrir: `@Public()` de `src/auth/decorators/public.decorator.ts`. Só autenticação e health check devem ser públicos.
- Papéis: `admin` e `client`. Rotas administrativas levam `@Roles('admin')`, no método ou na classe.
- Dados por cliente: use `@CurrentUser()` e `assertOwnership(user, clientId)` de `src/auth/ownership.ts`. Nunca confie em `clientId` vindo do body ou da query quando o usuário é cliente.
- `AuthUser` (`src/auth/auth-user.interface.ts`) é o tipo de `req.user`: `{ userId, email, role }`.
- Login hoje é por magic link (`/auth/request-link` e `/auth/verify-token`). Login com senha é a Fase 1 do plano; quando existir, `passwordHash` nunca sai em resposta.

## Regras de código

- `ValidationPipe` global com `whitelist` e `forbidNonWhitelisted`. Todo campo de DTO precisa de decorator do `class-validator`; campo sem decorator é descartado e campo extra no body vira 400. Ao criar um campo novo, atualizar o DTO e o front juntos.
- DTOs de update derivam de `PartialType`/`OmitType` do create. Campos sensíveis (`role`, `email`, `totalInvestido`) ficam fora do `UpdateClientDto` de propósito.
- Datas: a API recebe `YYYY-MM-DD` ou ISO e normaliza para meia-noite UTC (`parseDateAsUTC`, `parseLocalDate`). Devolver sempre `Date`/ISO, nunca `Timestamp` cru do Firestore.
- Leituras e escritas que precisam ser atômicas vão dentro de `firestore.runTransaction`, com todas as leituras antes das escritas.
- Mensagens para o usuário em pt-BR. O código legado tem pt-PT (`utilizador`, `registar`); corrigir ao tocar, não deixar novo.
- Logs: nunca registrar body de `/auth/*`, tokens ou hashes.
- Prettier e ESLint do repositório mandam; rodar `npm run lint` antes de terminar.

## Segurança: o que nunca fazer

- Commitar `.env`, JSON de service account ou qualquer chave. `.env.example` só tem placeholders.
- Criar endpoint que aceite `role` ou `totalInvestido` de fora.
- Adicionar `@Public()` em rota que leia ou escreva dados de cliente.
- Reintroduzir default para `JWT_SECRET`.
- Acessar o Firestore de um cliente. `firestore.rules` nega tudo; só a API, via Admin SDK, lê e escreve.

## Testes

- Jest, specs ao lado do código. Os guards, `assertOwnership` e a validação de ambiente têm testes; o motor de rateio e `PerformanceService` ainda não (Fase 1.5 do plano).
- Não há testes de integração com Firestore. Para validar fluxos ponta a ponta, usar o front contra a API local com `.env` de staging.
