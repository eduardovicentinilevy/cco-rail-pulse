# 🚆 RailPulse CCO — Centro de Controle Operacional (Linha 6-Laranja)

> **RailPulse CCO** é um sistema de monitoramento SCADA e supervisão operacionante em tempo real para a malha ferroviária da **Linha 6-Laranja (Linha Uni)**. A plataforma integra telemetria de subestações de tração (TSS), sinalização ATS ao longo das 15 estações do traçado e envio de comandos operacionais de alta prioridade sob arquitetura orientada a eventos.

---

## 📌 Sumário

* [Visão Geral](#-visão-geral)
* [Principais Funcionalidades](#-principais-funcionalidades)
* [Arquitetura e Decisões Técnicas](#️-arquitetura-e-decisões-técnicas)
* [Tech Stack](#️-tech-stack)
* [Estrutura do Projeto](#-estrutura-do-projeto)
* [Como Executar o Projeto](#️-como-executar-o-projeto)
* [Variáveis de Ambiente](#-variáveis-de-ambiente)
* [Credenciais de Teste](#-credenciais-de-teste)
* [Documentação do Barramento e APIs](#-documentação-do-barramento-e-apis)

---

## 📌 Visão Geral

O **RailPulse CCO** fornece aos operadores SOC uma interface de alta fidelidade visual para acompanhar os ativos críticos do traçado elétrico e metroferroviário entre **Brasilândia** e **São Joaquim**.

O sistema foi desenhado para operar de forma resiliente e autônoma, garantindo **auto-inicialização de schema (Self-Healing DDL)** e **sincronização de carga inicial (Auto-Seeding)** sem dependência de scripts manuais.

---

## 🚀 Principais Funcionalidades

* 🗺️ **Supervisão ATS da Malha Tronco:** Acompanhamento interativo do progresso dos trens (`T-01`, `T-04`, `T-07`, `T-12`) ao longo das 15 estações da Linha 6.
* ⚡ **Telemetria SCADA em Tempo Real (TSS):** Leitura de tensão das Subestações de Tração (kV) via WebSocket com gráficos dinâmicos de alta performance (`Recharts`).
* 🎮 **Painel de Comandos Operacionais:** Emissão de bloqueios de emergência (SIV), restrições de velocidade (20 km/h) e normalização de sinais com registro em log de auditoria.
* 🛡️ **Autenticação Segura & Proteção de Credenciais:** Autenticação via **JWT (JSON Web Tokens)** com mitigações contra ataques de *Timing Attack* no backend.
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

### **Frontend**

* **Biblioteca:** React 19 com TypeScript (modo `strict`)
* **Visualização de Dados:** Recharts
* **Estilização:** Design system em CSS puro (tokens, componentes e breakpoints) — Montserrat + JetBrains Mono
* **Build Tool:** Vite

---

## 📂 Estrutura do Projeto

```text
cco-rail-pulse/
├── backend/
│   ├── config/
│   │   └── env.ts                          # Configuração validada e centralizada (fail-fast)
│   ├── shared/
│   │   ├── errors.ts                       # AppError e subclasses com status HTTP
│   │   ├── jwt.ts                          # Assinatura e verificação de tokens
│   │   └── logger.ts                       # Logger com escopo por módulo
│   ├── domain/
│   │   ├── line.ts                         # Catálogo oficial das 15 estações (fonte única)
│   │   ├── entities/TrainSession.ts        # Entidade + regras de comando ferroviário
│   │   └── value-objects/StationCode.ts    # Código ATS validado contra a malha
│   ├── application/
│   │   ├── events/event-bus.ts             # Barramento de eventos de domínio (tipado)
│   │   ├── services/TelemetrySimulator.ts  # Simulador SCADA (random walk ancorado)
│   │   └── use-cases/                      # Casos de uso (comando com lock pessimista)
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── postgres.ts                 # Pool + helper de transação
│   │   │   ├── migrations.ts               # Self-healing DDL + auto-seeding
│   │   │   └── repositories/               # Persistência das composições
│   │   ├── repositories/                   # Operadores e trilha de auditoria
│   │   └── security/AuditLogger.ts         # Trilha append-only em disco
│   └── presentation/
│       ├── http/
│       │   ├── app.ts                      # Composição do Express (CORS, headers, rotas)
│       │   ├── middlewares/                # JWT, rate limit, erro e 404
│       │   ├── routes/                     # auth, operator, audit, network, health
│       │   └── server.ts                   # Bootstrap e encerramento gracioso
│       └── websocket/cco.gateway.ts        # Gateway WS autenticado no handshake
│
└── frontend/
    └── src/
        ├── styles/                         # Design system (tokens, base, componentes, layout)
        ├── config/env.ts                   # URL da API e chaves de storage
        ├── lib/format.ts                   # Datas, números, CSV e download
        ├── hooks/                          # Relógio, foco de modal, debounce
        ├── services/
        │   ├── api.ts                      # Cliente HTTP com tratamento de sessão
        │   └── websocket.service.ts        # Socket.IO autenticado por JWT
        ├── context/                        # Sessão do operador (validação + expiração)
        ├── components/
        │   ├── common/                     # Modal, ConfirmDialog, Toast, StatusPill…
        │   ├── layout/                      # Cabeçalho e barra de abas
        │   ├── dashboard/                   # Esquemático ATS, grade, terminal, feed
        │   ├── views/                       # Painel executivo, energia, ativos, KPIs, escala
        │   └── reports/AuditLogsView.tsx    # Trilha de auditoria paginada
        └── App.tsx
```

---

## ⚙️ Como Executar o Projeto

### Pré-requisitos

* **Node.js** v20 ou superior
* **PostgreSQL** rodando localmente ou via Docker

### 1. Banco de dados

Crie o banco (padrão: `railpulse_cco`). O schema e a carga inicial são aplicados
automaticamente no boot — não há script manual a rodar.

```bash
createdb railpulse_cco
```

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
| `SEED_OPERATOR_*` | `EDP-042` | Operador criado na primeira inicialização |

> ⚠️ O arquivo `.env` **não é versionado**. Use `.env.example` como modelo.

---

## 🔐 Credenciais de Teste

O operador padrão é criado na **primeira** inicialização (nas seguintes, a senha
existente é preservada):

| Parâmetro | Valor |
| --- | --- |
| **Credencial / ID** | `EDP-042` |
| **Senha padrão** | `123456` (configurável via `SEED_OPERATOR_PASSWORD`) |
| **Nível de acesso** | `OPERATOR_SOC` |

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
| --- | --- |
| `1` – `6` | Alterna entre as abas do painel |
| `←` / `→` | Navega entre abas (com foco na barra de abas) |
| `/` | Abre a Malha ATS e foca a busca de estações |
| `Esc` | Fecha o diálogo aberto |

---

## 📡 Documentação do Barramento e APIs

### REST Endpoints

| Método | Rota | Autenticação | Descrição |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | — | Autentica o operador e retorna o JWT |
| `GET` | `/api/auth/session` | Bearer | Valida a sessão restaurada pelo painel |
| `POST` | `/api/auth/logout` | Bearer | Registra o encerramento do turno |
| `GET` | `/api/operator/profile` | Bearer | Perfil do operador autenticado |
| `PATCH` | `/api/operator/profile/avatar` | Bearer | Persiste o avatar no cadastro |
| `GET` | `/api/network/stations` | Bearer | Catálogo da malha + telemetria corrente |
| `GET` | `/api/network/trains` | Bearer | Estado persistido das composições |
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
  * `alert:critical` — alarmes e notificações operacionais.
  * `train:command:acknowledged` — confirmação (`EXECUTED` | `FAILED`) do comando.

---

## 👨‍💻 Autor

Desenvolvido por **Eduardo Vicentini Levy** — *SOC Monitoring Analyst & Software Engineering Student*.
