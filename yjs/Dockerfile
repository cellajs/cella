# =============================================================================
# Yjs Relay Worker - Production Dockerfile
# =============================================================================
# Lightweight Node.js 24 container for Yjs collaborative editing relay
# Pure binary passthrough — no Y.Doc instantiation on server
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base image with pnpm
# -----------------------------------------------------------------------------
FROM node:24-alpine AS base

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Install dependencies
# -----------------------------------------------------------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY yjs/package.json ./yjs/
COPY shared/package.json ./shared/
COPY patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter yjs-worker...

# -----------------------------------------------------------------------------
# Stage 3: Build application
# -----------------------------------------------------------------------------
FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY yjs/package.json ./yjs/
COPY shared/package.json ./shared/
COPY patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter yjs-worker...

COPY yjs/ ./yjs/
COPY shared/ ./shared/

WORKDIR /app/yjs
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 4: Production image
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/yjs/dist ./yjs/dist
COPY --from=builder /app/yjs/package.json ./yjs/

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/yjs/node_modules ./yjs/node_modules

# Set ownership
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Build-time release identifier (Git SHA from CI). Surfaced at runtime via
# `/health` so the deploy verifier can confirm the new code is actually live.
ARG RELEASE_SHA=unknown
ENV RELEASE_SHA=${RELEASE_SHA}

# Environment variables
ENV NODE_ENV=production

# Expose WebSocket port
EXPOSE 4002

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4002/health || exit 1

# Start application
WORKDIR /app/yjs
CMD ["node", "dist/yjs-worker.js"]
