# =============================================================================
# Cella CDC Worker - Production Dockerfile
# =============================================================================
# Lightweight Node.js 24 container for CDC (Change Data Capture) worker
# Connects to PostgreSQL logical replication and forwards to backend WebSocket
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base image with pnpm
# -----------------------------------------------------------------------------
FROM node:24-alpine AS base

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9 --activate

# Set working directory
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Install dependencies
# -----------------------------------------------------------------------------
FROM base AS deps

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY cdc/package.json ./cdc/
COPY config/package.json ./config/
COPY shared/package.json ./shared/
COPY packages/tracing/package.json ./packages/tracing/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @cella/cdc...

# -----------------------------------------------------------------------------
# Stage 3: Build application
# -----------------------------------------------------------------------------
FROM base AS builder

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY cdc/package.json ./cdc/
COPY config/package.json ./config/
COPY shared/package.json ./shared/
COPY packages/tracing/package.json ./packages/tracing/

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile --filter @cella/cdc...

# Copy source code
COPY cdc/ ./cdc/
COPY backend/src ./backend/src
COPY config/ ./config/
COPY shared/ ./shared/
COPY packages/tracing/ ./packages/tracing/

# Build CDC worker (bundles backend imports via tsup)
WORKDIR /app/cdc
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 4: Production image
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

RUN addgroup --system --gid 1001 cella && \
    adduser --system --uid 1001 cella

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/cdc/dist ./cdc/dist
COPY --from=builder /app/cdc/package.json ./cdc/

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/cdc/node_modules ./cdc/node_modules

# Set ownership
RUN chown -R cella:cella /app

# Switch to non-root user
USER cella

# Environment variables
ENV NODE_ENV=production
ENV CDC_HEALTH_PORT=4001

# Expose health port
EXPOSE 4001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1

# Start the CDC worker
WORKDIR /app/cdc
CMD ["node", "dist/index.js"]
