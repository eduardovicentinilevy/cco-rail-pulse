# 🚆 RailPulse CCO — Centro de Controle Operacional (Linha 6-Laranja)

> **RailPulse CCO** é um sistema de monitoramento SCADA e supervisão operacional em tempo real para a malha ferroviária da **Linha 6-Laranja (Linha Uni)**. A plataforma integra telemetria de subestações de tração (TSS), sinalização ATS ao longo das 15 estações do traçado e envio de comandos operacionais de alta prioridade sob arquitetura orientada a eventos.

---

## 📌 Sumário

* [Visão Geral](#-visão-geral)
* [Principais Funcionalidades](#-principais-funcionalidades)
* [Arquitetura e Decisões Técnicas](#️-arquitetura-e-decisões-técnicas)
* [Tech Stack](#️-tech-stack)
* [Estrutura do Projeto](#-estrutura-do-projeto)
* [Como Executar o Projeto](#️-como-executar-o-projeto)
* [Qualidade: Testes e CI](#-qualidade-testes-e-ci)
* [Variáveis de Ambiente](#-variáveis-de-ambiente)
* [Credenciais de Teste](#-credenciais-de-teste)
* [Atalhos de Teclado](#️-atalhos-de-teclado)
* [Documentação do Barramento e APIs](#-documentação-do-barramento-e-apis)

---

## 📌 Visão Geral

O **RailPulse CCO** fornece aos operadores do Centro de Controle uma interface de alta fidelidade visual para acompanhar os ativos críticos do traçado elétrico e metroferroviário entre **Brasilândia** e **São Joaquim**.

O sistema foi desenhado para operar de forma resiliente e autônoma, garantindo **auto-inicialização de schema (Self-Healing DDL)** e **sincronização de carga inicial (Auto-Seeding)** sem dependência de scripts manuais.

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
2. **Fail-Fast & Resiliência:** A aplicação valida a integridade do banco de dados na inicialização (`bootstrap`), executando as *DDLs* (`CREATE TABLE IF NOT EXISTS`) e o *seed* do operador padrão antes de abrir a porta HTTP.
3. **Clean Architecture:** Separação rígida entre as camadas de **Apresentação** (`presentation`), **Aplicação** (`application`), **Domínio** (`domain`) e **Infraestrutura** (`infrastructure`).

---

## 🛠️ Tech Stack

### **Backend**

* **Runtime:** Node.js (v20+) com TypeScript (`tsx`)
* **Framework:** Express.js
* **Comunicação em Tempo Real:** Socket.IO
* **Segurança:** JSON Web Token (JWT) e Bcrypt
* **Banco de Dados:** PostgreSQL (Driver Nativo `pg`)
* **Testes:** `node:test` nativo, executado via `tsx`
* **CI:** GitHub Actions (tipos, testes, lint, build e integração com PostgreSQL)

### **Frontend**

* **Biblioteca:** React 19 com TypeScript (modo `strict`)
* **Visualização de Dados:** Recharts
* **Estilização:** Design system em CSS puro (tokens, componentes e breakpoints) — Montserrat + JetBrains Mono
* **Build Tool:** Vite

---

## 📂 Estrutura do Projeto

```text
cco-rail-pulse/
├── .github/workflows/ci.yml                # Tipos, testes, lint, build e integração
├── docker-compose.yml                      # PostgreSQL para desenvolvimento
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
│   │   ├── database/migrations.ts          # Self-healing DDL + auto-seeding
│   │   ├── database/repositories/          # Trens, ocorrências e telemetria
│   │   ├── repositories/                   # Operadores e trilha de auditoria
│   │   └── audit/AuditLogger.ts            # Trilha append-only em disco
│   ├── presentation/
│   │   ├── http/app.ts                     # Composição do Express
│   │   ├── http/middlewares/               # JWT, permissões, rate limit, erro e 404
│   │   ├── http/routes/                    # auth, operator, team, incidents, network, shift, audit, health
│   │   ├── http/server.ts                  # Bootstrap e encerramento gracioso
│   │   └── websocket/cco.gateway.ts        # Gateway WS autenticado no handshake
│   └── tests/                              # 76 testes unitários (node:test)
│
└── frontend/
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
        │   ├── views/                      # As doze seções do console
        │   └── reports/AuditLogsView.tsx   # Trilha de auditoria paginada
        └── App.tsx
```

### Seções do console

| Seção | O que entrega |
| --- | --- |
| **Painel executivo** | KPIs da malha, estações em alerta e últimas ocorrências |
| **Malha ATS** | Esquemático da via com trens reais, grade de estações e terminal de comandos |
| **Ocorrências** | Registro, tratativa e resolução com MTTR e trilha de auditoria |
| **Telemetria TSS** | Tensão por subestação em tempo real e comparação de curvas |
| **Série histórica** | Janelas agregadas (mín./méd./máx.) persistidas, por período |
| **Saúde de ativos** | Carga estimada dos transformadores a partir do afundamento de tensão |
| **Relatórios & KPIs** | Indicadores derivados do estado corrente e exportação CSV |
| **Escala & partidas** | Aderência à tabela horária calculada pela marcha real |
| **Passagem de turno** | Relatório consolidado do turno, pronto para impressão e assinatura |
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

O schema e a carga inicial são aplicados automaticamente no boot (self-healing DDL
e auto-seeding) — não há script de migração manual a rodar.

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

## 🔧 Variáveis de Ambiente

Referência completa em [`.env.example`](.env.example). Principais:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3333` | Porta HTTP do backend |
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
| `SEED_OPERATOR_*` | `EDP-042` | Operador criado na primeira inicialização |
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
npm test          # 76 testes unitários do domínio e da infraestrutura
npm run typecheck # tipos do backend, incluindo a suíte de testes
npm run check     # typecheck + testes + lint e build do frontend
```

A suíte cobre as regras que não podem regredir: ciclo de vida das ocorrências,
comandos ferroviários, validação de código de estação, hierarquia de permissões,
limitador de tentativas de login, deriva do simulador SCADA, verificação de JWT,
janela do relatório de turno e o contrato do catálogo da malha (que o mapa consome).

O workflow do GitHub Actions (`.github/workflows/ci.yml`) roda três jobs em paralelo:
tipos e testes do backend, lint e build do frontend, e um teste de integração que
sobe a API contra um PostgreSQL real para validar bootstrap, autenticação e a
recusa de rotas protegidas sem token.

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
| `GET` | `/health` | — | Saúde da aplicação e do banco (`503` se degradado) |

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
