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

# ---- Runtime image ----
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/

# Install only production deps
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend
COPY --from=builder /app/apps/web/dist /app/apps/web/dist

# Use vite preview to serve
EXPOSE 8443

CMD ["pnpm", "--filter", "@lexia/web", "preview"]
