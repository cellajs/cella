# =============================================================================
# Backend - Production Dockerfile
# =============================================================================
# Multi-stage build for the Node.js 24 Hono API server.
# Built by CI and deployed to Scaleway Instances (VMs) via infra/ (Pulumi).
# The same image is reused for the `ai` service (MODE=ai-worker); see
# infra/config/services.config.ts. Not used in local dev.
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

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY sdk/package.json ./sdk/
COPY locales/package.json ./locales/
COPY cdc/package.json ./cdc/
COPY yjs/package.json ./yjs/
COPY patches/ ./patches/

# Install production dependencies only (--ignore-scripts avoids native build issues)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter backend...

# -----------------------------------------------------------------------------
# Stage 3: Build application
# -----------------------------------------------------------------------------
FROM base AS builder

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY sdk/package.json ./sdk/
COPY locales/package.json ./locales/
COPY cdc/package.json ./cdc/
COPY yjs/package.json ./yjs/
COPY patches/ ./patches/

# Install all dependencies (including dev for build)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter backend...

# Copy source code
COPY backend/ ./backend/
COPY shared/ ./shared/
COPY sdk/ ./sdk/
COPY locales/ ./locales/
COPY cdc/ ./cdc/
COPY yjs/ ./yjs/
COPY json/ ./json/

# Build the backend
WORKDIR /app/backend
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 4: Production image
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy shared packages and data
COPY --from=builder /app/shared ./shared
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=builder /app/locales ./locales
COPY --from=builder /app/json ./json

# Copy drizzle migrations
COPY backend/drizzle ./backend/drizzle

# Download GeoIP databases (DB-IP Lite, CC BY 4.0). Best-effort — if the
# current-month URL isn't published yet, the build still succeeds and country
# lookups simply return null until the file is supplied at runtime.
RUN --mount=type=cache,id=apk-cache,target=/var/cache/apk \
    apk add --no-cache curl gzip && \
    mkdir -p /app/backend/geoip && \
    MONTH=$(date -u +%Y-%m) && \
    for kind in country asn; do \
      curl -fsSL "https://download.db-ip.com/free/dbip-${kind}-lite-${MONTH}.mmdb.gz" \
        | gunzip > "/app/backend/geoip/dbip-${kind}-lite.mmdb" \
        || echo "geoip: failed to fetch ${kind} for ${MONTH} — continuing without it"; \
    done

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
ENV PORT=4000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start the server
WORKDIR /app/backend
CMD ["node", "dist/main.js"]