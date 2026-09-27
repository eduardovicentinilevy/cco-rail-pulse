#
# Imagem do backend do RailPulse CCO (API REST + gateway WebSocket).
# Multi-estágio: compila com as devDependencies e publica só o build e as
# dependências de produção.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------- base
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# ---------------------------------------------------------------- build
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY backend ./backend
COPY scripts ./scripts
# Gera backend/dist e copia os .sql das migrações para junto do JavaScript emitido.
RUN npm run build

# ------------------------------------------------------- dependências
FROM base AS prod-deps
# bcrypt é um módulo nativo: quando não há binário pré-compilado para esta
# plataforma, o npm o compila na instalação.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------- runtime
FROM base AS runtime

ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3333 \
    LOG_FORMAT=json

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY package.json ./

# O processo roda sem privilégios: a imagem oficial do Node já traz o usuário `node`.
USER node

EXPOSE 3333

# Liveness: não toca no banco, para que uma indisponibilidade do Postgres não
# faça o Docker reiniciar um processo saudável.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT||3333}/health/live`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Sem wrapper de shell: o Node recebe SIGTERM diretamente e faz o encerramento gracioso.
CMD ["node", "backend/dist/presentation/http/server.js"]
