FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build API TypeScript
RUN pnpm --filter @lexia/api build

# ---- Runtime image ----
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built output
COPY --from=builder /app/apps/api/dist /app/apps/api/dist

EXPOSE 3001

# Run migrations then start
CMD ["sh", "-c", "pnpm --filter @lexia/api db:migrate && node apps/api/dist/server.js"]
