# =============================================================================
# Cella CDC Worker - Production Dockerfile
# =============================================================================
# Multi-stage build for CDC worker with PostgreSQL logical replication
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
COPY prepare.js ./
COPY patches/ ./patches/
COPY cdc/package.json ./cdc/
COPY shared/package.json ./shared/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @cella/cdc...

# -----------------------------------------------------------------------------
# Stage 3: Build application
# -----------------------------------------------------------------------------
FROM base AS builder

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prepare.js ./
COPY patches/ ./patches/
COPY cdc/package.json ./cdc/
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY locales/package.json ./locales/

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile --filter @cella/cdc...

# Copy source code (CDC depends on backend schemas via path aliases)
COPY cdc/ ./cdc/
COPY backend/ ./backend/
COPY shared/ ./shared/
COPY locales/ ./locales/

# Build the CDC worker
WORKDIR /app/cdc
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 4: Production image
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

# Add non-root user for security
RUN addgroup --system --gid 1001 cella && \
    adduser --system --uid 1001 cella

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/cdc/dist ./cdc/dist
COPY --from=builder /app/cdc/package.json ./cdc/

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/cdc/node_modules ./cdc/node_modules

# Copy shared package
COPY --from=builder /app/shared ./shared

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
