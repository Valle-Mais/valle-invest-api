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
- O rateio vive em `src/fund-operations/rateio.ts` (funções puras, testadas): participa de uma operação quem já estava na base quando ela foi registrada: transações aprovadas com `data < op.data`, ou com `data == op.data` e `approvedAt` (hora da aprovação) anterior ao `createdAt` da operação. Documentos antigos sem esses campos usam o `createTime` do Firestore. Aporte retroativo (data anterior, registrado depois) entra; cliente criado depois da operação, mesmo no mesmo dia, não entra. Duas operações no mesmo dia são encadeadas por hora de registro. Cada `Rendimento` em `client_transactions` guarda `operationId` e `taxa = resultado / patrimonioBase`; a operação guarda `patrimonioBase` e `taxa`. Rendimentos são arredondados a centavos e a diferença vai para o maior saldo, então a soma dos rendimentos é exatamente o `resultado`.
- `ClientTransactionsService.recalculateClientBalance` deriva `users.totalInvestido` das transações aprovadas. **`totalInvestido` nunca é aceito de fora da API.**
- Toda mutação de operação (`create`, `update`, `remove`) e todo aporte/resgate aprovado com data anterior a alguma operação (`triggerReprocessingIfNecessary`) passam por `FundOperationsService.reprocessOperationsFrom(startDate, changes)`: uma única transação do Firestore que apaga os rendimentos das operações com `data >= startDate` (por `operationId`, mais legados sem `operationId` e órfãos), refaz essas operações em ordem cronológica e atualiza `users.totalInvestido`/`status`. Rendimentos anteriores a `startDate` não são tocados. Não distribuir resultado fora desse caminho.
- `PerformanceService` calcula rentabilidade, CDI (API do Banco Central) e Ibovespa (Yahoo Finance) a cada requisição. A rentabilidade de um mês é o produto de `(1 + taxa)` dos rendimentos do cliente (ou das operações do fundo, no admin) naquele mês (`src/performance/monthly-return.ts`), então aportes e resgates no meio do mês não a alteram. Rendimento sem `taxa` (anterior ao backfill) cai na fórmula antiga `lucro / (saldo anterior + aportes)`. Períodos: o controller aceita o enum `mes | 6m | ano | inicio` e as strings legadas (`normalizePeriod`); qualquer outro valor vira 12 meses. `chartData.series` é % acumulado e `chartData.seriesReais` é patrimônio em R$.
- `POST /fund-operations/preview { resultado, data }` simula o rateio sem gravar, com a base na `data` informada (sem data, todas as aprovadas). `POST /fund-operations` calcula `resultado = valorVenda - valorInvestido` quando o campo não vem. CDI e Ibovespa têm cache em memória de 6 h por instância.
- `GET /performance/admin/summary` devolve também `kpis.fluxoLiquidoMes` e `kpis.pendentes`.
- `GET /client-transactions?clientId=` devolve `saldoApos` (saldo após cada aprovada, em ordem cronológica) e, com `include=operation`, anexa a operação do fundo aos rendimentos. Filtro `status` disponível.

## Autenticação e autorização

- `JwtAuthGuard`, `RolesGuard` e `ThrottlerGuard` são globais (`APP_GUARD` em `app.module.ts`), nessa ordem.
- Toda rota nova é protegida por padrão. Para abrir: `@Public()` de `src/auth/decorators/public.decorator.ts`. Só autenticação e health check devem ser públicos.
- Papéis: `admin` e `client`. Rotas administrativas levam `@Roles('admin')`, no método ou na classe.
- Dados por cliente: use `@CurrentUser()` e `assertOwnership(user, clientId)` de `src/auth/ownership.ts`. Nunca confie em `clientId` vindo do body ou da query quando o usuário é cliente.
- `AuthUser` (`src/auth/auth-user.interface.ts`) é o tipo de `req.user`: `{ userId, email, role }`.
- Login é por email e senha (`POST /auth/login`), com primeiro acesso por convite, recuperação e troca de senha. Tudo em `src/auth/auth.service.ts`; tokens de email em `auth-tokens.service.ts`; hash em `password.ts`; emails em `src/mail/`. O magic link (`request-link`, `verify-token`) ainda existe só para a transição e sai na Fase 5.
- `passwordHash` nunca sai em resposta. Todo retorno de `users` passa por `stripSensitive` (`src/users/user.sanitizer.ts`). Só `UsersService.findRaw*` devolve o documento inteiro, e só o `AuthService` chama esses métodos.
- Campos de autenticação (`passwordHash`, `passwordSetAt`, `mustSetPassword`) são escritos só por `UsersService.setAuthFields`, nunca pelos DTOs públicos.

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

- Jest, specs ao lado do código. Guards, `assertOwnership`, validação de ambiente, política de senha, os fluxos do `AuthService` (com mocks), o motor de rateio (`rateio.spec.ts` e `fund-operations.service.spec.ts`, este sobre o Firestore em memória de `src/testing/fake-firestore.ts`) e a rentabilidade do cliente (`performance.service.spec.ts`) têm testes. Os specs gerados pelo scaffold do Nest para controllers e para `clients`/`client-transactions`/`instruments` falham por falta do provider `FIRESTORE`; são dívida, não regressão.
- Depois de mudar o motor de rateio em produção, rodar `npm run seed -- --task=rebuild-yields` (apaga e recria todos os rendimentos; imprime saldo antes/depois por cliente). Primeiro em staging.
- Não há testes de integração com Firestore real. Para validar fluxos ponta a ponta, usar o front contra a API local com `.env` de staging.
