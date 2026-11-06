#
# Imagem do console web do RailPulse CCO: build do Vite publicado por nginx.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27-alpine

# ---------------------------------------------------------------- build
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vazio (padrão) faz o console falar com a própria origem, que o nginx encaminha
# ao backend. Só é preenchido quando a API vive em outro domínio.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM ${NGINX_IMAGE} AS runtime

# A imagem unprivileged já roda como usuário sem privilégios (uid 101) na 8080.
ENV LISTEN_PORT=8080 \
    BACKEND_ORIGIN=http://backend:3333

# O entrypoint do nginx expande as variáveis dos templates no boot do contêiner.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/ || exit 1
