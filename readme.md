Aqui está uma documentação completa e profissional em nível **Enterprise**, pronta para o `README.md` do repositório **RailPulse CCO**.

---

# 🚆 RailPulse CCO — Centro de Controle Operacional (Linha 6-Laranja)

> **RailPulse CCO** é um sistema de monitoramento SCADA e supervisão operacionante em tempo real para a malha ferroviária da **Linha 6-Laranja (Linha Uni)**. A plataforma integra telemetria de subestações de tração (TSS), sinalização ATS ao longo das 15 estações do traçado e envio de comandos operacionais de alta prioridade sob arquitetura orientada a eventos.

---

## 📌 Sumário

* [Visão Geral](https://www.google.com/search?q=%23-vis%C3%A3o-geral)
* [Principais Funcionalidades](https://www.google.com/search?q=%23-principais-funcionalidades)
* [Arquitetura e Decisões Técnicas](https://www.google.com/search?q=%23-arquitetura-e-decis%C3%B5es-t%C3%A9cnicas)
* [Tech Stack](https://www.google.com/search?q=%23-tech-stack)
* [Estrutura do Projeto](https://www.google.com/search?q=%23-estrutura-do-projeto)
* [Como Executar o Projeto](https://www.google.com/search?q=%23-como-executar-o-projeto)
* [Credenciais de Teste](https://www.google.com/search?q=%23-credenciais-de-teste)
* [Documentação do Barramento e APIs](https://www.google.com/search?q=%23-documenta%C3%A7%C3%A3o-do-barramento-e-apis)

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

* **Runtime:** Node.js (v24+) com TypeScript (`tsx`)
* **Framework:** Express.js
* **Comunicação em Tempo Real:** Socket.IO
* **Segurança:** JSON Web Token (JWT) e Bcrypt
* **Banco de Dados:** PostgreSQL (Driver Nativo `pg`)

### **Frontend**

* **Biblioteca:** React 18 com TypeScript
* **Visualização de Dados:** Recharts
* **Estilização:** CSS Custom Properties (Design System Linha Uni / Montserrat Font)
* **Build Tool:** Vite

---

## 📂 Estrutura do Projeto

```text
cco-rail-pulse/
├── backend/
│   ├── infrastructure/
│   │   ├── database/
│   │   │   └── postgres.ts               # Pool de Conexão com PostgreSQL
│   │   └── repositories/
│   │       └── pg-operator.repository.ts  # Persistência de Operadores e Logs
│   ├── application/
│   │   └── events/
│   │       └── event-bus.ts              # Barramento de Eventos de Domínio
│   └── presentation/
│       └── http/
│           ├── middlewares/
│           │   └── auth.middleware.ts    # Validação e Proteção JWT
│           └── server.ts                 # Entrypoint HTTP, WS e Bootstrap
│
└── frontend/
    └── src/
        ├── components/
        │   ├── CCODashboard.tsx          # Painel Principal do CCO
        │   ├── CCOVisualWidgets.tsx      # Feeds de Alerta e Status TSS
        │   ├── TSSChartWidget.tsx        # Gráfico de Telemetria de Tensão
        │   └── LoginScreen.tsx           # Tela de Autenticação
        ├── context/
        │   └── AuthContext.tsx           # Gerenciamento de Sessão JWT
        ├── services/
        │   └── websocket.service.ts      # Singleton do Cliente Socket.IO
        ├── App.tsx                       # Roteamento de Autenticação
        └── index.css                     # Design System & Cores da Linha Uni

```

---

## ⚙️ Como Executar o Projeto

### Pró-requisitos

* **Node.js** (v18 ou superior)
* **PostgreSQL** rodando localmente ou via Docker.

### 1. Configuração do Banco de Dados

Certifique-se de ter um banco de dados PostgreSQL criado (padrão: `railpulse_cco`).

### 2. Configuração do Backend

```bash
# Entre no diretório do backend
cd backend

# Instale as dependências
npm install

# Configure as variáveis de ambiente (.env na raiz ou na pasta backend)
# Exemplo de .env:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/railpulse_cco
# PORT=3333
# JWT_SECRET=railpulse_cco_super_secure_secret_key_2026

# Inicie o servidor em modo de desenvolvimento
npm run dev

```

### 3. Configuração do Frontend

```bash
# Abra um novo terminal e entre na pasta frontend
cd frontend

# Instale as dependências
npm install

# Inicie o ambiente de desenvolvimento do Vite
npm run dev

```

Acesse a aplicação no navegador em: `http://localhost:5173`

---

## 🔐 Credenciais de Teste

O servidor cria automaticamente a conta de operador administrativo padrão ao inicializar:

| Parâmetro | Credencial de Acesso |
| --- | --- |
| **Credencial / ID:** | `EDP-042` |
| **Senha Padrão:** | `123456` |
| **Nível de Acesso:** | `OPERATOR_SOC` |

---

## 📡 Documentação do Barramento e APIs

### REST Endpoints

* `POST /api/auth/login` — Autentica o operador e retorna o Token JWT.
* `GET /api/operator/profile` — Retorna o perfil do operador (Requer `Bearer Token`).
* `GET /health` — Retorna o status de saúde da aplicação e da conexão com o banco.

### Eventos WebSocket (`Socket.IO`)

* **Entrada (`Inbound`):**
* `train:command` — Emite comandos operacionais para os trens e registra em auditoria.


* **Saída (`Outbound`):**
* `telemetry:batch` — Pacote de leituras de tensão de subestações enviadas a cada 3s.
* `alert:critical` — Notificações e alarmes operacionais em tempo real.
* `train:command:acknowledged` — Confirmação do recebimento de comando enviado pelo operador.



---

## 👨‍💻 Autor

Desenvolvido por **Eduardo Vicentini Levy** — *SOC Monitoring Analyst & Software Engineering Student*.
