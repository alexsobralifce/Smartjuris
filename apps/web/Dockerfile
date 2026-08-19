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

# Copy built frontend static files
COPY --from=builder /app/apps/web/dist /app/dist

# Install serve globally to host the static site
RUN npm install -g serve

EXPOSE 8443

# Serve the static dist folder
CMD ["serve", "-s", "/app/dist", "-l", "8443"]
