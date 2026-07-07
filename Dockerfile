# =============================================================================
# Production Dockerfile (multi-target: backend | cdc | yjs)
# =============================================================================
# One file builds all three Node.js service images; CI selects a service with
# `--target <name>` (see `target` in infra/config/services.config.ts, threaded
# through print-deploy-env into .github/workflows/deploy.yml). Shared stages:
#
#   base     — node:24-alpine + corepack (pnpm version pinned by the root
#              package.json `packageManager` field)
#   runtime  — node:24-alpine + non-root `app` user + RELEASE_SHA/NODE_ENV,
#              the parent of every production target
#   geoip    — downloads GeoIP databases in a discarded stage (backend only)
#
#   manifests — all workspace manifests + lockfile (shared by every service:
#              `--filter` scopes each install, and the lockfile — which changes
#              with any dependency change — already invalidates all services)
#
# Per service: `<svc>-deps` (prod install) / `<svc>-builder` (full install +
# tsup build) → `<svc>` (production target). Targets: `backend` (also reused by
# the `mcp` service, MODE=mcp-worker on :4003 via `reusesImageOf`), `cdc`,
# `yjs`. Not used in local dev.
# =============================================================================

# -----------------------------------------------------------------------------
# Shared: base image with pnpm
# -----------------------------------------------------------------------------
FROM node:24-alpine AS base

# pnpm version comes from the root package.json `packageManager` field; corepack
# fetches it on first use in each stage.
RUN corepack enable

WORKDIR /app

# -----------------------------------------------------------------------------
# Shared: production runtime base (non-root user, release metadata)
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runtime

RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app

WORKDIR /app

# Build-time release identifier (Git SHA from CI). Surfaced at runtime via
# `/health` so the deploy verifier can confirm the new code is actually live.
ARG RELEASE_SHA=unknown
ENV RELEASE_SHA=${RELEASE_SHA}

ENV NODE_ENV=production

USER app

# -----------------------------------------------------------------------------
# Shared: GeoIP databases (DB-IP Lite, CC BY 4.0) — backend only
# -----------------------------------------------------------------------------
# Runs in a discarded stage so curl/gzip never reach the final image.
# Best-effort — if the current-month URL isn't published yet, the build still
# succeeds and country lookups simply return null until the file is supplied
# at runtime.
FROM node:24-alpine AS geoip

# ARG busts this stage's cache every release, so the data is refreshed per
# deploy (matching the pre-consolidation behavior).
ARG RELEASE_SHA=unknown

RUN --mount=type=cache,id=apk-cache,target=/var/cache/apk \
    apk add --no-cache curl gzip && \
    mkdir -p /geoip && \
    MONTH=$(date -u +%Y-%m) && \
    for kind in country asn; do \
      curl -fsSL "https://download.db-ip.com/free/dbip-${kind}-lite-${MONTH}.mmdb.gz" \
        | gunzip > "/geoip/dbip-${kind}-lite.mmdb" \
        || echo "geoip: failed to fetch ${kind} for ${MONTH} — continuing without it"; \
    done

# -----------------------------------------------------------------------------
# Shared: workspace manifests for dependency installs
# -----------------------------------------------------------------------------
# One stage for all services: each install below is scoped by `--filter`, and
# pnpm-lock.yaml pins resolution, so unused manifests can't change what gets
# installed — they only ride along for the workspace layout.
FROM base AS manifests

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY sdk/package.json ./sdk/
COPY locales/package.json ./locales/
COPY cdc/package.json ./cdc/
COPY yjs/package.json ./yjs/
COPY patches/ ./patches/

# =============================================================================
# backend — Hono API server
# =============================================================================

# Install production dependencies only (--ignore-scripts avoids native build issues)
FROM manifests AS backend-deps

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter backend...

# Install all dependencies (including dev for build) and build with tsup
FROM manifests AS backend-builder

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter backend...

COPY backend/ ./backend/
COPY shared/ ./shared/
COPY sdk/ ./sdk/
COPY locales/ ./locales/
COPY cdc/ ./cdc/
COPY yjs/ ./yjs/
COPY json/ ./json/

WORKDIR /app/backend
RUN pnpm build

# Production image
FROM runtime AS backend

# Built application
COPY --from=backend-builder --chown=app:app /app/backend/dist ./backend/dist
COPY --from=backend-builder --chown=app:app /app/backend/package.json ./backend/

# Production dependencies
COPY --from=backend-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=backend-deps --chown=app:app /app/backend/node_modules ./backend/node_modules

# Shared packages and data
COPY --from=backend-builder --chown=app:app /app/shared ./shared
COPY --from=backend-deps --chown=app:app /app/shared/node_modules ./shared/node_modules
COPY --from=backend-builder --chown=app:app /app/locales ./locales
COPY --from=backend-builder --chown=app:app /app/json ./json

# Drizzle migrations
COPY --chown=app:app backend/drizzle ./backend/drizzle

# GeoIP databases
COPY --from=geoip --chown=app:app /geoip ./backend/geoip

ENV PORT=4000

EXPOSE 4000

# Compose injects its own healthcheck on deploy (infra/compose/infrastructure.ts);
# this baked one covers standalone runs. ${PORT} keeps it honest when the image
# is reused on another port (mcp runs it with PORT=4003).
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-4000}/health || exit 1

WORKDIR /app/backend
CMD ["node", "dist/main.js"]

# =============================================================================
# cdc — Change Data Capture worker
# =============================================================================
# Connects to PostgreSQL logical replication and forwards to backend WebSocket.

# Install production dependencies only (--ignore-scripts avoids native build issues)
FROM manifests AS cdc-deps

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter cdc-worker...

# Install all dependencies (including dev for build) and build with tsup
# Install cdc and shared deps; backend deps needed for bundling backend/src imports
FROM manifests AS cdc-builder

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter cdc-worker... --filter backend...

COPY cdc/ ./cdc/
COPY backend/src ./backend/src
COPY shared/ ./shared/
COPY sdk/ ./sdk/
COPY locales/ ./locales/

WORKDIR /app/cdc
RUN pnpm build

# Production image (internal-only: no EXPOSE, no baked healthcheck)
FROM runtime AS cdc

COPY --from=cdc-builder --chown=app:app /app/cdc/dist ./cdc/dist
COPY --from=cdc-builder --chown=app:app /app/cdc/package.json ./cdc/

COPY --from=cdc-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=cdc-deps --chown=app:app /app/cdc/node_modules ./cdc/node_modules

WORKDIR /app/cdc
CMD ["node", "dist/cdc-worker.js"]

# =============================================================================
# yjs — collaborative editing relay worker
# =============================================================================
# Pure binary passthrough — no Y.Doc instantiation on server.

# Install production dependencies only (--ignore-scripts avoids native build issues)
FROM manifests AS yjs-deps

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter yjs-worker...

# Install all dependencies (including dev for build) and build with tsup
FROM manifests AS yjs-builder

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter yjs-worker...

COPY yjs/ ./yjs/
COPY shared/ ./shared/

WORKDIR /app/yjs
RUN pnpm build

# Production image
FROM runtime AS yjs

COPY --from=yjs-builder --chown=app:app /app/yjs/dist ./yjs/dist
COPY --from=yjs-builder --chown=app:app /app/yjs/package.json ./yjs/

COPY --from=yjs-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=yjs-deps --chown=app:app /app/yjs/node_modules ./yjs/node_modules

# WebSocket port
EXPOSE 4002

# Compose injects its own healthcheck on deploy (infra/compose/infrastructure.ts);
# this baked one covers standalone runs.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4002/health || exit 1

WORKDIR /app/yjs
CMD ["node", "dist/yjs-worker.js"]
