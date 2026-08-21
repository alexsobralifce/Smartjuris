FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/ packages/

# Install ALL dependencies including platform native bindings
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend
RUN pnpm --filter @lexia/web build

# ---- Runtime image (nginx): SPA + proxy /api para a API (mesma origem) ----
FROM nginx:1.27-alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template

# Railway injeta PORT; o entrypoint oficial do nginx faz envsubst em *.template
# substituindo ${PORT}. O proxy /api usa a rede privada (smartjuris-api.railway.internal).
EXPOSE 8080
