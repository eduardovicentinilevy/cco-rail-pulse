# 🚆 RailPulse CCO — Centro de Controle Operacional (Linha 6-Laranja)

> **RailPulse CCO** é um sistema de monitoramento SCADA e supervisão operacional em tempo real para a malha ferroviária da **Linha 6-Laranja (Linha Uni)**. A plataforma integra telemetria de subestações de tração (TSS), sinalização ATS ao longo das 15 estações do traçado e envio de comandos operacionais de alta prioridade sob arquitetura orientada a eventos.

---

## 📌 Sumário

* [Visão Geral](#-visão-geral)
* [Sobre os Dados](#-sobre-os-dados)
* [Principais Funcionalidades](#-principais-funcionalidades)
* [Arquitetura e Decisões Técnicas](#️-arquitetura-e-decisões-técnicas)
* [Tech Stack](#️-tech-stack)
* [Estrutura do Projeto](#-estrutura-do-projeto)
* [Como Executar o Projeto](#️-como-executar-o-projeto)
* [Implantação em Produção](#-implantação-em-produção)
* [Migrações de Banco](#-migrações-de-banco)
* [Observabilidade: Logs e Health Checks](#-observabilidade-logs-e-health-checks)
* [Qualidade: Testes e CI](#-qualidade-testes-e-ci)
* [Variáveis de Ambiente](#-variáveis-de-ambiente)
* [Credenciais de Teste](#-credenciais-de-teste)
* [Atalhos de Teclado](#️-atalhos-de-teclado)
* [Documentação do Barramento e APIs](#-documentação-do-barramento-e-apis)

---

## 📌 Visão Geral

O **RailPulse CCO** fornece aos operadores do Centro de Controle uma interface de alta fidelidade visual para acompanhar os ativos críticos do traçado elétrico e metroferroviário entre **Brasilândia** e **São Joaquim**.

O sistema foi desenhado para operar de forma resiliente e autônoma: o schema evolui por
**migrações versionadas e idempotentes**, aplicadas em transação e registradas no próprio
banco, e a carga inicial de demonstração é sincronizada sem scripts manuais. A publicação é
containerizada — `docker compose up -d` sobe banco, API e console web.

---

## 🔍 Sobre os Dados

Este é um projeto de portfólio, sem integração com sistemas SCADA/ATS reais da
Linha 6-Laranja. Para que quem avalia o projeto — inclusive quem opera a linha
de verdade — saiba exatamente o que está vendo, a tabela abaixo separa o que é
**infraestrutura real** (mecanismo de verdade, dado fabricado) do que é
**simulação declarada** (mecanismo e dado ambos ilustrativos):

| Camada | Natureza | Detalhe |
| --- | --- | --- |
| Autenticação, 2FA/TOTP, RBAC, JWT | **Real** | Implementação própria, sem mocks — inclusive o segundo fator segue RFC 4226/6238 de verdade |
| Persistência (PostgreSQL), auditoria, ciclo de vida de ocorrências | **Real** | Escritas e leituras de banco de verdade; nada é mantido só em memória |
| Tensão das subestações (TSS) e deslocamento dos trens | **Simulação declarada** | *Random walk* ancorado nos valores nominais reais do projeto elétrico da linha — plausível, mas gerado no servidor, não lido de campo |
| Ocupação de plataformas | **Simulação declarada** | Estimativa calculada no navegador (horário de pico + posição da estação no traçado), sem qualquer sensor de fato |
| CFTV | **Simulação declarada** | Status de câmera sorteado de forma determinística por estação — não há vídeo nem integração real; "Reportar falha" abre uma ocorrência de verdade no banco |
| Estações, ordem e nomes da Linha 6-Laranja | **Real** | Confere com o traçado e a nomenclatura oficiais; o desenho do trilho no mapa é estilizado, não é cartografia exata |

Onde a interface poderia sugerir uma fonte real (um "sensor", uma "câmera"), o
texto da própria tela deixa claro que é uma estimativa ou uma simulação.

---

## 🚀 Principais Funcionalidades

* 🚉 **Supervisão ATS da Malha Tronco:** Acompanhamento interativo do progresso dos trens (`T-01`, `T-04`, `T-07`, `T-12`) ao longo das 15 estações da Linha 6.
* ⚡ **Telemetria SCADA em Tempo Real (TSS):** Leitura de tensão das Subestações de Tração (kV) via WebSocket com gráficos dinâmicos de alta performance (`Recharts`).
* 🎮 **Painel de Comandos Operacionais:** Frenagem de emergência, restrição de velocidade (20 km/h) e liberação de sinal, aplicados sob lock pessimista e registrados na trilha de auditoria.
* 🛡️ **Autenticação Segura & Proteção de Credenciais:** Autenticação via **JWT (JSON Web Tokens)** com mitigações contra ataques de *Timing Attack* no backend.
* 🔐 **Autenticação em Duas Etapas (2FA/TOTP):** Segundo fator compatível com Google Authenticator, Authy e afins — implementação própria de HOTP/TOTP (RFC 4226/6238), sem dependências externas, validada contra os vetores de teste oficiais do RFC.
* 🚨 **Gestão de Ocorrências:** Ciclo de vida completo (abertura → tratativa → resolução) com máquina de estados no domínio, designação de responsável, MTTR e difusão em tempo real por WebSocket.
* 👥 **Cadastro de Operadores com RBAC:** Perfis hierárquicos (Operador de Controle, Supervisor, Administrador) com permissões aplicadas no servidor e refletidas na interface.
* 🗺️ **Mapa Geográfico da Linha:** Traçado em SVG com as 15 estações posicionadas ao longo do eixo noroeste–centro, composições deslizando entre estações e realce pulsante das estações em alerta.
* ⇄ **Passagem de Turno:** Relatório consolidado do turno — comandos emitidos, ocorrências abertas/resolvidas, pendências herdadas e comportamento da tensão — com folha de impressão que gera o documento assinável.
* ⌘ **Paleta de Comandos (Ctrl+K):** Busca difusa por seções, estações, composições e ações rápidas, navegável inteiramente pelo teclado.
* 🔔 **Alertas de Eventos Críticos:** Sinal sonoro sintetizado (Web Audio) e notificação do sistema para ocorrências críticas, com preferência persistida.
* 📈 **Série Histórica de Telemetria:** Leituras agregadas por janela (mínima, média e máxima) e persistidas no PostgreSQL, com gráfico de faixa, seleção de período e poda automática por retenção.
* 📋 **Trilha de Auditoria em Tempo Real:** Log contínuo de ações de operadores e eventos críticos de rede salvos no banco PostgreSQL.
* 🔔 **Central de Alarmes:** Histórico persistido (entre turnos) de todo alarme gerado por ocorrências e comandos críticos, com reconhecimento pelo operador, filtros e exportação — complementa o feed ao vivo, que existe só na sessão do navegador.
* 🚶 **Ocupação de Plataformas:** Estimativa de fluxo de passageiros por estação, combinando horário de pico e posição no traçado, com alerta de superlotação.
* 📹 **CFTV:** Supervisão de cobertura de câmeras por estação — reportar uma falha abre, de verdade, uma ocorrência formal na fila de tratativa.
* ☏ **Comunicações:** Diário de bordo do CCO — registro de contatos por rádio (condução, manutenção, segurança), telefone e presenciais, vinculados a estação ou composição.
* 📘 **Procedimentos Operacionais:** Biblioteca de referência com contingências para emergência, energia, sinalização, meteorologia, evacuação e segurança, com busca e filtro por categoria.

---

## 🏗️ Arquitetura e Decisões Técnicas

O projeto adota os princípios de **Clean Architecture** combinados com **Event-Driven Architecture (EDA)** no backend:

```text
               ┌──────────────────────────────────────────────────┐
               │              React Frontend (Vite)               │
               └───────────────────────┬──────────────────────────┘
                                       │ HTTP / WebSocket (Socket.io)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ BACKEND ENTERPRISE CORE                                                        │
│                                                                                 │
│   [ Presentation Layer ] ──> HTTP REST API & WebSocket Gateway                  │
│                                      │                                          │
│   [ Application Layer ]  ──> Domain Event Bus (Node.js EventEmitter)            │
│                                      │                                          │
│   [ Infrastructure ]     ──> PostgreSQL Connection Pool & Repositories          │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
                         ┌──────────────────────────┐
                         │ PostgreSQL Database (DB) │
                         └──────────────────────────┘

```

1. **Desacoplamento de Eventos (Event Bus):** O gateway de WebSocket assina eventos globais em um barramento de domínio (`domainEventBus`), permitindo escalar os emissores de telemetria de forma isolada.
2. **Fail-Fast & Resiliência:** A aplicação valida a conexão com o banco na inicialização (`bootstrap`), aplica as **migrações pendentes** sob *advisory lock* — para que réplicas subindo em paralelo não disputem o schema — e só então abre a porta HTTP.
3. **Clean Architecture:** Separação rígida entre as camadas de **Apresentação** (`presentation`), **Aplicação** (`application`), **Domínio** (`domain`) e **Infraestrutura** (`infrastructure`).
4. **Locking Pessimista em Comandos de Trem:** `ProcessTrainCommand` (caso de uso por trás do `train:command` do WebSocket) adquire `SELECT ... FOR UPDATE` sobre o registro do trem dentro de uma transação, com `lock_timeout` configurável (`TRAIN_COMMAND_LOCK_TIMEOUT_MS`). Dois operadores comandando a mesma composição são serializados pelo próprio Postgres — nunca há leitura-e-escrita concorrente sobre o mesmo trem — e a persistência na trilha de auditoria acontece na mesma transação do estado, nunca desacoplada dela. Deadlock é estruturalmente impossível aqui (nunca mais de um lock de linha por transação); o risco real seria inanição por uma transação lenta, mitigado pelo `lock_timeout`, que devolve `409 Conflict` em vez de deixar o operador esperando indefinidamente.

---

## 🛠️ Tech Stack

### **Backend**

* **Runtime:** Node.js (v20+) com TypeScript (`tsx`)
* **Framework:** Express.js
* **Comunicação em Tempo Real:** Socket.IO
* **Segurança:** JSON Web Token (JWT) e Bcrypt
* **Banco de Dados:** PostgreSQL (Driver Nativo `pg`)
* **Testes:** `node:test` nativo, executado via `tsx`
* **Migrações:** SQL versionado (`NNN_nome.sql`) com runner próprio, checksum e ledger em `schema_migrations`
* **Observabilidade:** logs estruturados em JSON com id de correlação por requisição
* **Empacotamento:** Docker multi-estágio (backend) e nginx (console), orquestrados por Docker Compose
* **CI:** GitHub Actions (tipos, testes, lint, build, integração com PostgreSQL e build da stack Docker)

### **Frontend**

* **Biblioteca:** React 19 com TypeScript (modo `strict`)
* **Visualização de Dados:** Recharts
* **Estilização:** Design system em CSS puro (tokens, componentes e breakpoints) — Montserrat + JetBrains Mono. Tema claro alinhado à identidade real da Linha Uni: fundo branco, azul-marinho institucional e laranja âmbar, botões e pílulas de status arredondados
* **Build Tool:** Vite

---

## 📂 Estrutura do Projeto

```text
cco-rail-pulse/
├── .github/workflows/ci.yml                # Tipos, testes, lint, build, integração e Docker
├── Dockerfile                              # Imagem de produção do backend (multi-estágio)
├── docker-compose.yml                      # Stack completa: PostgreSQL + backend + console
├── scripts/copy-sql.mjs                    # Leva os .sql das migrações para o build
├── backend/
│   ├── config/env.ts                       # Configuração validada e centralizada (fail-fast)
│   ├── shared/                             # Erros, JWT, TOTP (2FA), logger e helpers de HTTP
│   ├── domain/
│   │   ├── line.ts                         # Catálogo oficial das 15 estações (fonte única)
│   │   ├── roles.ts                        # Perfis hierárquicos e permissões
│   │   ├── entities/TrainSession.ts        # Regras de comando ferroviário
│   │   ├── entities/Incident.ts            # Máquina de estados das ocorrências
│   │   └── value-objects/StationCode.ts    # Código ATS validado contra a malha
│   ├── application/
│   │   ├── events/event-bus.ts             # Barramento de eventos de domínio (tipado)
│   │   ├── services/TelemetrySimulator.ts  # Simulador SCADA (random walk ancorado)
│   │   ├── services/TelemetryArchiver.ts   # Agregação por janela da série histórica
│   │   ├── services/TrainMotionSimulator.ts # Vaivém das composições entre os terminais
│   │   └── use-cases/                      # Comando de trem e relatório de turno
│   ├── infrastructure/
│   │   ├── database/migrations/            # SQL versionado (fonte única do schema)
│   │   ├── database/migrator.ts            # Runner: ledger, checksum e advisory lock
│   │   ├── database/migrate.cli.ts         # `npm run migrate` / `migrate:status` / `seed`
│   │   ├── database/bootstrap.ts           # Migração + carga inicial no boot
│   │   ├── database/seed.ts                # Operador padrão, equipe, composições e procedimentos
│   │   ├── database/repositories/          # Trens, ocorrências, telemetria, alarmes, comunicações e procedimentos
│   │   ├── repositories/                   # Operadores e trilha de auditoria
│   │   └── audit/AuditLogger.ts            # Trilha append-only em disco
│   ├── presentation/
│   │   ├── http/app.ts                     # Composição do Express
│   │   ├── http/middlewares/               # Log de acesso, JWT, permissões, rate limit e erro
│   │   ├── http/routes/                    # auth, operator, team, incidents, alarms, communications, procedures, network, shift, audit, health
│   │   ├── http/server.ts                  # Bootstrap e encerramento gracioso
│   │   └── websocket/cco.gateway.ts        # Gateway WS autenticado no handshake
│   └── tests/                              # 96 testes unitários (node:test)
│
└── frontend/
    ├── Dockerfile                          # Build do Vite publicado por nginx
    ├── nginx.conf.template                 # Proxy de /api, /health e /socket.io + SPA
    └── src/
        ├── styles/                         # Design system (tokens, base, componentes, layout, impressão)
        ├── config/env.ts                   # URL da API e chaves de storage
        ├── lib/                            # Formatação, CSV e espelho das permissões
        ├── hooks/                          # useResource, alertas críticos, relógio, foco de modal
        ├── services/                       # Cliente HTTP e Socket.IO autenticado
        ├── context/                        # Sessão do operador (validação + expiração)
        ├── components/
        │   ├── common/                     # Modal, ConfirmDialog, CommandPalette, Toast…
        │   ├── layout/                     # Cabeçalho e navegação lateral
        │   ├── dashboard/                  # Esquemático ATS, mapa da linha, grade, terminal
        │   ├── views/                      # As dezessete seções do console
        │   └── reports/AuditLogsView.tsx   # Trilha de auditoria paginada
        └── App.tsx
```

### Seções do console

| Seção | O que entrega |
| --- | --- |
| **Painel executivo** | KPIs da malha, estações em alerta e últimas ocorrências |
| **Malha ATS** | Esquemático da via com trens reais, grade de estações e terminal de comandos |
| **Ocorrências** | Registro, tratativa e resolução com MTTR e trilha de auditoria |
| **Central de Alarmes** | Histórico persistido de alarmes, com reconhecimento e exportação |
| **Ocupação** | Estimativa de fluxo de passageiros por estação, com alerta de superlotação |
| **CFTV** | Cobertura de câmeras por estação, com abertura de ocorrência ao reportar falha |
| **Telemetria TSS** | Tensão por subestação em tempo real e comparação de curvas |
| **Série histórica** | Janelas agregadas (mín./méd./máx.) persistidas, por período |
| **Saúde de ativos** | Carga estimada dos transformadores a partir do afundamento de tensão |
| **Relatórios & KPIs** | Indicadores derivados do estado corrente e exportação CSV |
| **Escala & partidas** | Aderência à tabela horária calculada pela marcha real |
| **Passagem de turno** | Relatório consolidado do turno, pronto para impressão e assinatura |
| **Comunicações** | Diário de bordo — contatos por rádio, telefone e presenciais com equipes de campo |
| **Procedimentos** | Biblioteca de contingências operacionais, com busca e filtro por categoria |
| **Equipe** | Cadastro de operadores, perfis de acesso e revogação de credenciais |
| **Status do sistema** | Saúde da API, do banco e do barramento em tempo real, sondada a cada 15s |
| **Configurações** | Preferências de alerta do operador e referência de atalhos de teclado |

---

## ⚙️ Como Executar o Projeto

### Pré-requisitos

* **Node.js** v20 ou superior
* **PostgreSQL** rodando localmente ou via Docker

### 1. Banco de dados

Com Docker (recomendado):

```bash
docker compose up -d postgres
```

Ou com um PostgreSQL local:

```bash
createdb railpulse_cco
```

As migrações pendentes e a carga inicial são aplicadas no boot da API. Para rodá-las
fora do boot (deploy em etapas, por exemplo), use `npm run migrate` — veja
[Migrações de Banco](#-migrações-de-banco).

### 2. Backend

```bash
# Na raiz do repositório
npm install

# Configure o ambiente
cp .env.example .env   # ajuste DB_PASS e, em produção, JWT_SECRET

npm run dev            # desenvolvimento (tsx watch)
npm run typecheck      # verificação de tipos
npm run build && npm start   # produção
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # opcional: em dev o Vite já faz proxy para o backend
npm run dev
```

Acesse `http://localhost:5173`.

O servidor de desenvolvimento do Vite faz proxy de `/api`, `/socket.io` e `/health`
para o backend, de modo que **nenhuma URL fica hardcoded no código do frontend**.

---

## 🚢 Implantação em Produção

A stack completa — PostgreSQL, API e console web — sobe em contêineres:

```bash
cp .env.example .env

# Obrigatórios: em produção o boot falha sem um segredo de assinatura próprio e
# recusa a senha padrão do operador de demonstração.
node -e "const r=n=>require('crypto').randomBytes(n).toString('hex');console.log('JWT_SECRET='+r(48));console.log('SEED_OPERATOR_PASSWORD='+r(16))" >> .env

docker compose up -d --build
```

| Serviço | Imagem | Publicado em | O que faz |
| --- | --- | --- | --- |
| `postgres` | `postgres:16-alpine` | `5432` | Banco, em volume nomeado (`railpulse-pgdata`) |
| `backend` | `Dockerfile` (multi-estágio) | `3333` | API REST e gateway WebSocket |
| `frontend` | `frontend/Dockerfile` (nginx) | `8080` | Console web e proxy de `/api`, `/health` e `/socket.io` |
| `migrate` | mesma imagem do backend | — | Passo de deploy sob demanda (perfil `tools`) |

Acesse o console em `http://localhost:8080`. O bundle publicado usa caminhos relativos e o
nginx os encaminha ao backend, então **a mesma imagem serve qualquer ambiente** — não há URL
de API compilada no JavaScript.

### Decisões das imagens

* **Backend em multi-estágio:** o estágio de build carrega as `devDependencies` e o
  TypeScript; a imagem final leva apenas `backend/dist`, as dependências de produção e o
  usuário sem privilégios `node`. O `CMD` chama o Node diretamente, sem `npm` no meio, para
  que o `SIGTERM` do orquestrador chegue ao processo e o [encerramento gracioso](#-observabilidade-logs-e-health-checks) aconteça.
* **`HEALTHCHECK` na sonda de liveness:** uma queda do PostgreSQL não faz o Docker reiniciar
  um processo que está saudável — quem reflete a dependência é o `/health/ready`.
* **Console atrás do nginx:** ativos com hash recebem cache de um ano, as demais rotas caem
  no `index.html` (SPA) e o `/socket.io/` mantém o *upgrade* de WebSocket aberto.
* **Apenas migrações no deploy:** para várias réplicas, rode o schema uma vez e suba a
  aplicação com o boot desimpedido:

  ```bash
  docker compose run --rm migrate          # aplica as migrações e sai
  DB_MIGRATE_ON_BOOT=false docker compose up -d backend frontend
  ```

> ⚠️ Em produção real, defina `DB_SEED_ON_BOOT=false`: as credenciais de demonstração deste
> repositório são públicas. Enquanto a carga de demonstração estiver ligada, a senha do
> operador semeado vem de `SEED_OPERATOR_PASSWORD` — que o boot exige, e recusa no valor
> padrão.

### Somente o banco, para desenvolver

```bash
docker compose up -d postgres   # backend e frontend seguem em npm run dev, com hot reload
```

---

## 🗄️ Migrações de Banco

O schema é versionado em `backend/infrastructure/database/migrations/`, um arquivo por
migração no padrão `NNN_nome_em_snake_case.sql`. A fonte única da verdade é esse diretório.

```bash
npm run migrate          # aplica as pendentes, em ordem
npm run migrate:status   # o que já foi aplicado, e quando
npm run seed             # carga de demonstração (operador, equipe e composições)
```

Como funciona:

* Cada migração roda **em sua própria transação** e é registrada na tabela
  `schema_migrations` com nome, checksum e data.
* Toda a execução acontece sob um **advisory lock** do PostgreSQL: réplicas subindo ao mesmo
  tempo em um deploy gradual serializam a migração em vez de disputá-la.
* Migrações aplicadas são **imutáveis**. Editar um arquivo já aplicado muda seu checksum e o
  boot falha com a divergência apontada — o caminho correto é criar uma nova migração.
* A linha de base (`001_baseline.sql`) reproduz o schema que o DDL auto-aplicado anterior
  gerava e é idempotente, de modo que **bancos já em operação a adotam sem recriar nada**.
  A `002_legacy_alignment.sql` converte o que só existe nesses bancos (colunas de 2FA
  ausentes e o perfil `OPERATOR_SOC`).

Para criar uma migração, adicione o próximo número ao diretório:

```bash
cat > backend/infrastructure/database/migrations/003_minha_mudanca.sql <<'SQL'
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS root_cause TEXT;
SQL
npm run migrate
```

Os `.sql` não são compilados pelo `tsc`: o `npm run build` os copia para `backend/dist`
(`scripts/copy-sql.mjs`), de modo que a imagem de produção — que roda só o build — os encontre.

---

## 📈 Observabilidade: Logs e Health Checks

### Logs estruturados

Em produção o backend emite **uma linha JSON por evento**, pronta para ser coletada por
Docker, Loki, CloudWatch e afins sem parser customizado. Em desenvolvimento a saída
continua legível no terminal (`LOG_FORMAT=pretty`).

```json
{"timestamp":"2026-02-14T12:03:11.027Z","level":"info","service":"railpulse-cco","version":"1.4.0","environment":"production","scope":"HTTP","message":"GET /api/network/trains 200","requestId":"cf157320-a85a-453b-8329-bf81fceab26d","operatorId":"EDP-042","method":"GET","path":"/api/network/trains","status":200,"durationMs":3.4,"ip":"10.0.4.18"}
```

* **`requestId`** nasce em toda requisição (ou é herdado do cabeçalho `X-Request-Id` que o
  proxy já tenha emitido), volta na resposta e acompanha **todos** os logs daquela
  requisição — inclusive os de camadas mais fundas, via `AsyncLocalStorage`.
* **`operatorId`** entra no contexto assim que o JWT é validado, ligando cada linha ao
  operador que a provocou.
* Uma resposta `500` devolve o `requestId` no corpo: o operador cita o id e a falha é
  localizada no agregador.
* O nível segue o desfecho: `5xx` em `error`, `4xx` em `warn`, sondas de saúde em `debug`
  (elas batem a cada poucos segundos e só fariam ruído).

Ajuste com `LOG_LEVEL` (`debug` | `info` | `warn` | `error`) e `LOG_FORMAT` (`json` | `pretty`).

### Health checks

| Rota | Para quem | Comportamento |
| --- | --- | --- |
| `GET /health/live` | `HEALTHCHECK` do contêiner, *liveness probe* | `200` enquanto o processo estiver de pé. **Não toca no banco**: uma indisponibilidade do PostgreSQL não deve fazer o supervisor matar um processo saudável |
| `GET /health/ready` | Balanceador, *readiness probe* | `200` só quando o banco responde **e** a instância está em rotação; `503` caso contrário |
| `GET /health` | Painel "Status do sistema" do console | Diagnóstico completo (versão, ambiente, uptime, banco); `503` quando degradado |

No encerramento gracioso o serviço **sai de rotação antes de derrubar qualquer coisa**: ao
receber `SIGTERM`, o `/health/ready` passa a responder `503` e só então a telemetria, os
sockets, o HTTP e o pool são fechados — o balanceador para de encaminhar tráfego enquanto as
requisições em andamento terminam.

---

## 🔧 Variáveis de Ambiente

Referência completa em [`.env.example`](.env.example). Principais:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3333` | Porta HTTP do backend |
| `WEB_PORT` | `8080` | Porta em que o console (nginx) é publicado pelo Compose |
| `APP_VERSION` | `dev` | Versão publicada; aparece no `/health` e em cada linha de log |
| `LOG_LEVEL` | `info` (prod) / `debug` | Piso de severidade dos logs |
| `LOG_FORMAT` | `json` (prod) / `pretty` | Formato da saída de log |
| `DB_MIGRATE_ON_BOOT` | `true` | Aplica as migrações pendentes no boot |
| `DB_SEED_ON_BOOT` | `true` | Semeia a carga de demonstração; **desligue em produção real** |
| `DATABASE_URL` | — | Alternativa às variáveis `DB_*` |
| `JWT_SECRET` | *(dev-only)* | **Obrigatório** quando `NODE_ENV=production` — o boot falha sem ele |
| `JWT_EXPIRES_IN` | `8h` | Validade do token de sessão |
| `CORS_ORIGIN` | `*` | Origens permitidas, separadas por vírgula |
| `LOGIN_MAX_ATTEMPTS` | `8` | Tentativas de login por janela |
| `LOGIN_WINDOW_MS` | `60000` | Janela do limitador de tentativas |
| `TELEMETRY_INTERVAL_MS` | `3000` | Período de emissão da telemetria SCADA |
| `TRAIN_MOTION_INTERVAL_MS` | `4000` | Intervalo base entre avanços de uma estação por composição (±35% de variação aleatória, para não sincronizar todos os trens) |
| `TELEMETRY_BUCKET_SECONDS` | `60` | Janela de agregação da série histórica |
| `TELEMETRY_RETENTION_DAYS` | `7` | Retenção da série histórica |
| `TRAIN_COMMAND_LOCK_TIMEOUT_MS` | `4000` | Prazo do lock pessimista (`FOR UPDATE`) de um comando de trem antes de recusar com `409` |
| `SEED_OPERATOR_*` | `EDP-042` | Operador criado na primeira inicialização — `SEED_OPERATOR_PASSWORD` é obrigatório e não pode ficar no valor padrão quando `NODE_ENV=production` (o boot falha sem isso) |
| `SEED_OPERATOR_ROLE` | `SUPERVISOR` | Perfil do operador de demonstração |

> ⚠️ O arquivo `.env` **não é versionado**. Use `.env.example` como modelo.

---

## 🔐 Credenciais de Teste

O operador padrão é criado na **primeira** inicialização (nas seguintes, a senha
existente é preservada). A equipe de plantão (`MAR-109`, `SOU-012`, `LIV-551`)
também é semeada, compartilhando a mesma senha de demonstração, para exercitar o
cadastro e os perfis de acesso:

| Parâmetro | Valor |
| --- | --- |
| **Credencial / ID** | `EDP-042` |
| **Senha padrão** | `123456` (configurável via `SEED_OPERATOR_PASSWORD`) |
| **Nível de acesso** | `SUPERVISOR` (configurável em `SEED_OPERATOR_ROLE`) |

### Perfis de acesso

| Perfil | Comandos na malha | Ocorrências | Consultar equipe | Gerir equipe |
| --- | :---: | :---: | :---: | :---: |
| `OPERADOR` | ✅ | ✅ | ✅ | — |
| `SUPERVISOR` | ✅ | ✅ | ✅ | ✅ |
| `ADMIN` | ✅ | ✅ | ✅ | ✅ |

Os perfis são hierárquicos: cada nível herda as permissões dos níveis abaixo. A
verificação ocorre **no servidor** (`requirePermission`); a interface apenas desabilita
o que seria recusado, para não prometer ao operador uma ação que ele não tem.

---

## 🧪 Qualidade: Testes e CI

```bash
npm test          # 96 testes unitários do domínio e da infraestrutura
npm run typecheck # tipos do backend, incluindo a suíte de testes
npm run check     # typecheck + testes + lint e build do frontend
```

A suíte cobre as regras que não podem regredir: ciclo de vida das ocorrências,
comandos ferroviários, validação de código de estação, hierarquia de permissões,
limitador de tentativas de login, deriva do simulador SCADA, verificação de JWT,
janela do relatório de turno, o contrato do catálogo da malha (que o mapa consome) e o
carregamento das migrações versionadas (ordem, unicidade de versão e checksum).

O workflow do GitHub Actions (`.github/workflows/ci.yml`) roda quatro jobs em paralelo:
tipos e testes do backend; lint e build do frontend; um teste de integração que aplica as
migrações e sobe a **API compilada** contra um PostgreSQL real, validando bootstrap,
autenticação, as sondas de saúde e a recusa de rotas protegidas sem token; e um job que
constrói as duas imagens Docker, sobe a stack completa e exercita o login e uma rota
protegida **através do nginx**.

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
| --- | --- |
| `Ctrl` / `⌘` + `K` | Abre a paleta de comandos |
| `1` – `9`, `0` | Alterna entre as dez primeiras seções do console (as demais ficam na paleta) |
| `↑` / `↓` | Navega entre seções (com foco na barra lateral) |
| `/` | Abre a Malha ATS e foca a busca de estações |
| `Esc` | Fecha o diálogo aberto |

---

## 📡 Documentação do Barramento e APIs

### REST Endpoints

| Método | Rota | Autenticação | Descrição |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | — | Autentica o operador; retorna o JWT ou um desafio de 2FA |
| `POST` | `/api/auth/login/mfa` | — (desafio) | Troca o código do autenticador pela sessão |
| `GET` | `/api/auth/session` | Bearer | Valida a sessão restaurada pelo painel |
| `POST` | `/api/auth/logout` | Bearer | Registra o encerramento do turno |
| `GET` | `/api/operator/profile` | Bearer | Perfil do operador autenticado |
| `PATCH` | `/api/operator/profile/avatar` | Bearer | Persiste o avatar no cadastro |
| `GET` | `/api/operator/mfa` | Bearer | Indica se o 2FA está ativo |
| `POST` | `/api/operator/mfa/enroll` | Bearer | Gera um novo segredo TOTP pendente |
| `POST` | `/api/operator/mfa/confirm` | Bearer | Confirma o segredo e ativa o 2FA |
| `POST` | `/api/operator/mfa/disable` | Bearer + senha | Desativa o 2FA |
| `GET` | `/api/network/stations` | Bearer | Catálogo da malha + telemetria corrente |
| `GET` | `/api/network/trains` | Bearer | Estado persistido das composições |
| `GET` | `/api/network/telemetry/history?hours&stations` | Bearer | Série histórica agregada de tensão |
| `GET` | `/api/incidents?limit&offset&status&severity&search` | Bearer | Ocorrências paginadas e filtráveis |
| `POST` | `/api/incidents` | Bearer | Registra uma ocorrência |
| `GET` | `/api/incidents/meta` | Bearer | Categorias, severidades e status válidos |
| `GET` | `/api/incidents/stats` | Bearer | Contadores e MTTR |
| `GET` | `/api/incidents/:id` | Bearer | Detalhe da ocorrência |
| `PATCH` | `/api/incidents/:id/status` | Bearer | Avança o ciclo de vida da ocorrência |
| `GET` | `/api/team` | Bearer | Cadastro de operadores e perfis |
| `POST` | `/api/team` | Supervisor+ | Cadastra um operador |
| `PATCH` | `/api/team/:id/role` | Supervisor+ | Altera o perfil de acesso |
| `PATCH` | `/api/team/:id/active` | Supervisor+ | Revoga ou reativa a credencial |
| `GET` | `/api/shift/report?since` | Bearer | Relatório consolidado de passagem de turno |
| `GET` | `/api/audit-logs?limit&offset&search` | Bearer | Trilha de auditoria paginada |
| `GET` | `/api/alarms?limit&offset&severity&acknowledged&search` | Bearer | Histórico de alarmes paginado e filtrável |
| `GET` | `/api/alarms/stats` | Bearer | Contadores (total, pendentes, críticos pendentes, 24h) |
| `PATCH` | `/api/alarms/:id/ack` | Bearer | Reconhece um alarme pendente |
| `GET` | `/api/communications?limit&offset&channel&search` | Bearer | Comunicações paginadas e filtráveis |
| `POST` | `/api/communications` | Bearer | Registra uma comunicação no diário de bordo |
| `GET` | `/api/procedures?category&search` | Bearer | Biblioteca de procedimentos operacionais |
| `GET` | `/health` | — | Saúde da aplicação e do banco (`503` se degradado) |
| `GET` | `/health/live` | — | Liveness: `200` enquanto o processo estiver de pé |
| `GET` | `/health/ready` | — | Readiness: `200` só com banco acessível e instância em rotação |

### Eventos WebSocket (`Socket.IO`)

A conexão é **autenticada no handshake** (`auth.token`). O `operatorId` usado nos
comandos vem do token — nunca do payload enviado pelo cliente.

* **Entrada (`Inbound`)**
  * `train:command` — `{ trainId, command, targetBlock? }`, com `command` em
    `EMERGENCY_BRAKE_OVERRIDE` | `SPEED_RESTRICTION_20KM` | `RELEASE_SIGNAL`.

* **Saída (`Outbound`)**
  * `telemetry:batch` — leituras de tensão de todas as estações (a cada 3 s).
  * `train:sync` — estado completo das composições, enviado ao conectar.
  * `train:updated` — composição alterada por um comando.
  * `incident:changed` — ocorrência registrada ou alterada por qualquer operador.
  * `alert:critical` — alarmes e notificações operacionais.
  * `train:command:acknowledged` — confirmação (`EXECUTED` | `FAILED`) do comando.

---

## 👨‍💻 Autor

Desenvolvido por **Eduardo Vicentini Levy** — *SOC Monitoring Analyst & Software Engineering Student*.
