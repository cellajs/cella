# =============================================================================
# Cella Backend - Production Dockerfile
# =============================================================================
# Multi-stage build for Node.js 24 Hono API server
# Optimized for Scaleway Serverless Containers
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
COPY backend/package.json ./backend/
COPY config/package.json ./config/
COPY shared/package.json ./shared/
COPY packages/tracing/package.json ./packages/tracing/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @cella/backend...

# -----------------------------------------------------------------------------
# Stage 3: Build application
# -----------------------------------------------------------------------------
FROM base AS builder

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY config/package.json ./config/
COPY shared/package.json ./shared/
COPY packages/tracing/package.json ./packages/tracing/

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile --filter @cella/backend...

# Copy source code
COPY backend/ ./backend/
COPY config/ ./config/
COPY shared/ ./shared/
COPY packages/tracing/ ./packages/tracing/
COPY locales/ ./locales/
COPY json/ ./json/

# Build the backend
WORKDIR /app/backend
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
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy config and shared packages
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages/tracing ./packages/tracing
COPY --from=builder /app/locales ./locales
COPY --from=builder /app/json ./json

# Copy drizzle migrations
COPY backend/drizzle ./backend/drizzle

# Set ownership
RUN chown -R cella:cella /app

# Switch to non-root user
USER cella

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start the server
WORKDIR /app/backend
CMD ["node", "dist/index.js"]
