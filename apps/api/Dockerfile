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

# Copy entire workspace (with node_modules from builder)
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api/package.json apps/api/
COPY --from=builder /app/packages packages/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/apps/api/node_modules apps/api/node_modules/

# Copy built dist and migration files
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/src/db/migrations apps/api/src/db/migrations
COPY --from=builder /app/apps/api/drizzle.config.ts apps/api/
COPY --from=builder /app/apps/api/src/db apps/api/src/db

EXPOSE 3001

# Use built startup script that runs migrations then starts server (no drizzle-kit needed)
CMD ["node", "apps/api/dist/startup.js"]
