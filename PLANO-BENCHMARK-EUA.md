# Plano: trocar o benchmark CDI por uma taxa dos EUA

**Status (05/11/2026):** não implementado. A plataforma já mostra os valores em US$, mas a rentabilidade continua sendo comparada com o CDI. Este documento descreve como fazer a troca quando o produto decidir.

## Por que trocar

O CDI é a taxa do interbancário brasileiro. Com a carteira mostrada em dólar, o equivalente americano é a **EFFR (Effective Federal Funds Rate)**. Ela é a taxa efetiva do overnight entre bancos nos EUA, assim como o CDI é a taxa efetiva do overnight no Brasil. A meta do Fed (target range) corresponde à meta da Selic e **não** deve ser usada como benchmark.

Alternativas:

| Taxa | O que é | Quando escolher |
|---|---|---|
| **EFFR** (recomendada) | Fed Funds efetiva, publicada pelo NY Fed | Equivalente direto do CDI e mais reconhecida ("Fed Funds") |
| SOFR | Overnight com lastro em Treasuries, publicada pelo NY Fed | Se o mercado-alvo usa SOFR como referência |
| T-Bill 3 meses | Rendimento dos títulos curtos do Tesouro americano | Se o benchmark deve refletir "caixa aplicado" e não o interbancário |

## Fonte dos dados

### EFFR pela API do NY Fed (sem chave)

```
GET https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

```json
{ "refRates": [
  { "effectiveDate": "2026-11-04", "type": "EFFR", "percentRate": 3.88,
    "targetRateFrom": 3.75, "targetRateTo": 4.00, "volumeInBillions": 115 }
]}
```

- Datas em ISO. A lista vem **da mais recente para a mais antiga**.
- `percentRate` é número.
- Só traz dias úteis dos EUA.
- Para SOFR, o caminho é `/api/rates/secured/sofr/search.json`, com o mesmo formato.

### Alternativa: FRED (exige chave gratuita)

```
GET https://api.stlouisfed.org/fred/series/observations?series_id=DFF&api_key=KEY&file_type=json&observation_start=YYYY-MM-DD
```

- `DFF` é a EFFR diária com os fins de semana preenchidos.
- Os valores vêm como string, e `"."` significa dia sem dado.
- A chave vira a variável de ambiente `FRED_API_KEY`, validada em `src/config/env.validation.ts`, e precisa ser configurada no Vercel.
- Para T-Bill, use `DTB3`.

## Diferença crucial no cálculo

A série 12 do BCB vem em **% ao dia**. Por isso `CdiService.calculateMonthlyReturns` faz `acc * (1 + rate / 100)`.

A EFFR e a SOFR vêm em **% ao ano, base actual/360**. A taxa de um dia útil vale até o próximo dia útil, então a taxa de sexta conta 3 dias. O fator do período fica assim:

```
fator = Π (1 + (percentRate / 100) × diasCorridos / 360)
```

```ts
const sorted = [...rates].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
sorted.forEach((r, i) => {
  const next = sorted[i + 1];
  const days = next ? (Date.parse(next.effectiveDate) - Date.parse(r.effectiveDate)) / 86_400_000 : 1;
  const key = r.effectiveDate.slice(0, 7); // "YYYY-MM"
  factors[key] = (factors[key] ?? 1) * (1 + (r.percentRate / 100) * days / 360);
});
// returnValue = (factor - 1) * 100, mês em base 0
```

Aproximação aceita: quando um fim de semana atravessa a virada do mês, os dias dele contam no mês da sexta.

**A saída continua sendo `MonthlyReturn[]` (`{ year, month, returnValue }` em % ao mês).** Por isso nada no `PerformanceService` muda: TWR, `percentualSobreCDI`, séries do gráfico e tabela mensal consomem o mesmo formato. Como o benchmark é calculado a cada requisição, não há dado salvo para migrar; o histórico inteiro passa a ser comparado com a nova taxa automaticamente.

## Implementação

### API (`valle-invest-api`)

1. **Interface comum.** Criar `src/benchmark/benchmark.provider.ts` com `interface BenchmarkProvider { code: 'CDI' | 'EFFR' | 'SOFR'; name: string; getMonthlyReturns(): Promise<MonthlyReturn[]> }`. Mover `MonthlyReturn` de `src/cdi/cdi.service.ts` para esse arquivo.
2. **Provedores.**
   - `CdiService` passa a implementar a interface e não muda de lógica.
   - Novo `EffrService` (`src/benchmark/effr.service.ts`) com o mesmo padrão do `CdiService`: `HttpService`, cache de 6 horas, `inflight` para não duplicar requisições e array vazio em caso de erro. Usar a conversão anual → mensal acima. A janela inicial continua sendo de 5 anos.
3. **Seleção.**
   - Nova variável `BENCHMARK=CDI|EFFR`, com padrão `CDI`, validada em `env.validation.ts`.
   - Criar um `BenchmarkModule` que exporta o token `BENCHMARK` (`useFactory`) e resolve o provedor certo.
   - Trocar `CdiModule` por `BenchmarkModule` em `src/app.module.ts` e `src/performance/performance.module.ts`.
4. **`PerformanceService` (`src/performance/performance.service.ts`).**
   - Injetar `@Inject(BENCHMARK) benchmark: BenchmarkProvider` no lugar de `CdiService`. Hoje ele é chamado nas linhas 50 e 238.
   - Nas séries e na tabela, trocar o rótulo fixo `'CDI'` (linhas 176, 425 e 535) por `this.benchmark.code`.
   - Os nomes de variáveis `cdi*` podem ficar ou virar `benchmark*`; isso não muda o comportamento.
5. **Contrato da resposta.**
   - Adicionar `benchmark: { code, name }` em `DashboardDataDto` e no resumo do admin.
   - O tipo `label: 'Fundo' | 'CDI'` (`dashboard-data.dto.ts:4` e `performance.service.ts:17`) passa a ser `'Fundo' | BenchmarkCode`.
   - **Manter `percentualSobreCDI`** com o mesmo nome, para não quebrar o front em produção durante o deploy. Opcionalmente, adicionar o alias `percentualSobreBenchmark` e remover o nome antigo depois.
6. **Testes.**
   - Teste unitário do `EffrService` com uma sequência fixa: sexta + segunda + feriado, e virada de mês. Conferir o fator contra cálculo manual.
   - Ajustar `performance.service.spec.ts` para mockar o token `BENCHMARK`.

### Front (`valle-invest-front`)

Hoje "CDI" está escrito direto no código. Os textos devem passar a usar `benchmark.name` / `benchmark.code` vindos da API:

- `src/app/services/performance.service.ts`: tipos `label: 'Fundo' | 'CDI'` (linha 17) e o novo campo `benchmark`.
- `src/app/pages/private/client/dashboard/dashboard.component.html:65`: KPI "vs CDI".
- `src/app/pages/private/admin/dashboard/dashboard.component.ts:45`: "… do CDI".
- `src/app/pages/private/client/shared/performance-table.component.ts:5` (mapa `LABELS`) e `.html:5` ("Carteira vs CDI, em % ao mês").
- `src/app/pages/private/client/shared/evolution-chart.component.ts`: legenda da série, que já vem do `name` da API, e o comentário.
- `src/app/pages/public/login/login.component.html:6`: texto institucional "comparados com o CDI". Esse fica fixo e é trocado manualmente.

### Ordem do deploy

1. Fazer o deploy da API com `BENCHMARK=CDI` e o campo `benchmark` novo. Nada muda para o usuário.
2. Fazer o deploy do front que lê `benchmark` para os textos.
3. Trocar `BENCHMARK=EFFR` no Vercel e fazer o redeploy da API. Para reverter, basta voltar a variável.

## Verificação

- `npm test` na API, incluindo o novo teste do `EffrService`.
- Com `BENCHMARK=EFFR` local, conferir `GET /performance/:clientId`:
  - a série tem `name: 'EFFR'`;
  - `benchmark.code === 'EFFR'`;
  - o retorno mensal fica entre 0,30% e 0,35% para uma EFFR de ~3,9% a.a. (≈ 3,88 × 30/360).
- No front, o KPI, a tabela e a legenda do gráfico mostram "EFFR" (ou o nome escolhido), e nenhum texto ainda diz "CDI", exceto o da página de login.
