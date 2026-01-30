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
COPY packages/tracing/package.json ./packages/tracing/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @cella/cdc...

# -----------------------------------------------------------------------------
# Stage 3: Production image
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

# Add non-root user for security
RUN addgroup --system --gid 1001 cella && \
    adduser --system --uid 1001 cella

WORKDIR /app

# Copy package files
COPY cdc/package.json ./cdc/

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/cdc/node_modules ./cdc/node_modules

# Copy source code (CDC runs with tsx, not compiled)
COPY cdc/src ./cdc/src
COPY cdc/tsconfig.json ./cdc/

# Copy config and shared packages
COPY config/ ./config/
COPY packages/tracing/ ./packages/tracing/

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
CMD ["npx", "tsx", "src/index.ts"]
