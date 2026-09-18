# Desenho: primeiro passo de multi-tenant

Status: **proposta, aguardando confirmação.** Nada de schema foi alterado ainda.

## 1. O problema hoje

A malha inteira é uma constante de código. `backend/domain/line.ts` declara
`LINE_NAME` e as 15 estações da Linha 6-Laranja, e a partir dela pendem:

| Ponto de acoplamento | Arquivo |
| --- | --- |
| Validação de código de estação | `backend/domain/value-objects/StationCode.ts:18` |
| Catálogo servido ao painel | `backend/presentation/http/routes/network.routes.ts:22` |
| Ordem das estações no deslocamento | `backend/application/services/TrainMotionSimulator.ts:104` |
| Leituras do simulador SCADA | `backend/application/services/TelemetrySimulator.ts:35` |
| Relatório de passagem de turno | `backend/application/use-cases/BuildShiftReportUseCase.ts:167` |
| Carga inicial (seed) | `backend/infrastructure/database/migrations.ts:150` |
| Catálogo duplicado no frontend | `frontend/src/data/stations.ts` |
| Traçado geográfico do mapa | `frontend/src/components/dashboard/LineMap.tsx:19` |
| Nome da linha na interface | Sidebar, LoginScreen, OverviewView, TrackSchematic, `index.html` |

Nenhuma das cinco tabelas (`operators`, `audit_logs`, `trains`, `incidents`,
`telemetry_samples`) tem coluna de cliente. Além disso há dois problemas que só
aparecem com o segundo cliente e que valem citar desde já:

- **Vazamento no WebSocket.** `cco.gateway.ts` emite todo evento do
  `domainEventBus` para todo socket conectado. Com dois clientes no mesmo
  processo, o painel do cliente A recebe a telemetria e as ocorrências do B.
- **Chaves primárias globais.** `operators.id` (`EDP-042`) e `trains.train_id`
  (`T-01`) são PK globais. Dois clientes não podem usar a mesma numeração de
  crachá ou de composição.

## 2. As entidades novas

Três tabelas, nesta hierarquia: **cliente → linha → estação**.

```sql
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(40) UNIQUE NOT NULL,   -- 'linha-uni'
  name        VARCHAR(120) NOT NULL,         -- 'Linha Uni'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        VARCHAR(20) NOT NULL,          -- 'L6'
  name        VARCHAR(120) NOT NULL,         -- 'Linha 6-Laranja (Linha Uni)'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, code)
);

CREATE TABLE stations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id             UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  code                VARCHAR(10) NOT NULL,
  name                VARCHAR(120) NOT NULL,
  position            INTEGER NOT NULL,      -- ordem física ('order' é palavra reservada)
  substation          VARCHAR(20) NOT NULL,
  nominal_voltage_kv  NUMERIC(5,2) NOT NULL,
  headway_seconds     INTEGER,
  latitude            NUMERIC(9,6),          -- hoje presa no LineMap.tsx
  longitude           NUMERIC(9,6),
  UNIQUE (line_id, code),
  UNIQUE (line_id, position)
);
```

Um cliente pode ter mais de uma linha desde o início — é o caso natural de uma
concessionária, e não custa nada agora.

## 3. Como as tabelas existentes se amarram

- **Operacionais** (`trains`, `incidents`, `telemetry_samples`) passam a ter
  `line_id`: o dado é da linha, e o cliente vem por ela.
- **De pessoas** (`operators`, `audit_logs`) passam a ter `tenant_id`: um
  supervisor pode responder por mais de uma linha do mesmo cliente.
- `trains` e `operators` ganham id interno (UUID) e a chave de negócio vira
  `UNIQUE (line_id, train_id)` / `UNIQUE (tenant_id, login_id)`.
- `telemetry_samples` troca `UNIQUE (station_code, bucket_at)` por
  `UNIQUE (station_id, bucket_at)`.

A migração é idempotente, no mesmo estilo self-healing do
`migrations.ts` atual: cria as tabelas, semeia o cliente `linha-uni` com a
linha `L6` e as 15 estações a partir da constante de hoje (que vira
`backend/infrastructure/database/seeds/linha-uni.ts`), preenche
`tenant_id`/`line_id` das linhas existentes apontando para ela e só então
aplica `NOT NULL`. Banco em produção sobe sem intervenção manual.

## 4. Como o tenant atravessa a aplicação

1. **Login.** O payload ganha `tenantSlug`. Em produção ele vem do subdomínio
   (`cliente.railpulse.app`); em desenvolvimento, de um campo na tela.
2. **JWT.** O token passa a carregar `{ operatorId, role, tenantId, lineId }`.
   O `lineId` é a linha ativa do operador; trocar de linha reemite o token.
3. **Repositórios.** Todo método recebe `tenantId`/`lineId` como parâmetro
   explícito, não por variável de contexto. Um filtro esquecido é vazamento de
   dados entre clientes, e parâmetro obrigatório o compilador cobra.
4. **Catálogo.** `domain/line.ts` deixa de ser constante e vira o tipo
   `LineCatalog`, montado a partir do banco por `LineCatalogRepository`, com
   cache em memória por `lineId` (estação muda uma vez por década) invalidado na
   escrita.
5. **`StationCode`.** O construtor passa a validar só o formato (3 caracteres).
   "Pertence a esta linha?" é pergunta do catálogo —
   `catalog.requireStation(code)` — porque um value object não tem como saber de
   qual cliente é o código.
6. **Simuladores.** `TelemetrySimulator` e `TrainMotionSimulator` deixam de ser
   singletons e passam a viver num registro, uma instância por linha ativa,
   iniciada no boot e na criação de uma linha nova. Os eventos passam a carregar
   `lineId`.
7. **WebSocket.** No handshake o socket entra na sala `line:<lineId>` derivada
   do JWT, nunca do payload do cliente, e o gateway emite para a sala em vez de
   fazer broadcast. É o que fecha o vazamento da seção 1.

## 5. Frontend

- `frontend/src/data/stations.ts` é apagado. O catálogo vem de
  `GET /api/network/stations`, que já existe; o que sobra do arquivo é o
  esqueleto de carregamento.
- Nome da linha e do cliente vêm de um `LineContext` alimentado pela API. Some
  toda string literal "Linha 6-Laranja" da interface, inclusive `document.title`
  e o `<title>` do `index.html`.
- `LineMap.tsx` passa a desenhar a partir de `latitude`/`longitude` das
  estações, e cai no esquemático linear quando a linha não tem coordenadas
  cadastradas.

## 6. O que este passo não faz

Fora de escopo, na ordem em que eu faria depois: identidade visual por cliente
(logo, cores), cadastro de clientes e linhas pela interface com importação de
estações por CSV, Row Level Security no Postgres como segunda barreira, limites
de uso e cobrança por cliente.

## 7. Decisões que tomei por padrão

Se nenhuma for contestada, sigo com elas:

- Cliente e linha são entidades separadas desde já (um cliente, N linhas).
- Chaves UUID nas tabelas novas; as antigas mantêm a PK atual até o item da
  seção 3.
- Roteamento de login por slug/subdomínio, não por credencial global.
- Isolamento lógico (coluna `tenant_id`), não schema nem banco por cliente.

## 8. Plano de entrega

| PR | Conteúdo |
| --- | --- |
| 1 | Tabelas, migração com backfill, catálogo vindo do banco, tenant no JWT, salas no WebSocket, simuladores por linha, frontend consumindo a API |
| 2 | Cadastro de clientes e linhas pela interface, identidade visual por cliente |
| 3 | RLS, testes com dois clientes simultâneos, limites por cliente |

Depois do PR 1 o sistema continua rodando com um cliente só, mas o segundo
passa a ser cadastro, não fork.
