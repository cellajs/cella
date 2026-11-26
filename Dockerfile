# check=skip=InvalidDefaultArgInFrom
# =============================================================================
# Production Dockerfile (multi-target: backend | cdc | yjs)
# =============================================================================
# One file builds all three Node.js service images; a build selects a service with
# `--target <name>` (the `target` of infra/config/services.config.ts, which the
# release build's bake reads in cella-cli:src/infra/tasks/build-images.ts). Shared stages:
#
#   base    : node:<NODE_VERSION>-alpine + pnpm from npm, at the version the
#              root package.json `packageManager` field pins
#   runtime : node:<NODE_VERSION>-alpine + non-root `app` user +
#              RELEASE_SHA/NODE_ENV, the parent of every production target
#
#   manifests: the lockfile + the manifests of the packages the services build
#              from (shared by every service; `--filter` scopes each install,
#              and lockfile changes already invalidate all services)
#
# Per service: `<svc>-deps` (prod install) / `<svc>-builder` (full install +
# rolldown build) → `<svc>` (production target). Targets: `backend` (also reused by
# the `mcp`, `oauth` and `jobs` services through `reusesImageOf`, each with its
# own SERVICE and port), `cdc`, `yjs`. Not used in local dev.
#
# NODE_VERSION is the root package.json `engines.node`, so the images run the
# Node CI tested. It has no default (the `check=skip` line on top keeps Docker
# from warning about that); a local build passes it:
#   docker build --build-arg NODE_VERSION="$(jq -r .engines.node package.json)" --target backend .
# The release build passes NODE_IMAGE, the `node` image at that version by
# digest from cella-cli:src/infra/lib/deploy/node-image.ts, which a Node bump refreshes; any
# other build takes the tag.
# =============================================================================

ARG NODE_VERSION
ARG NODE_IMAGE=node:${NODE_VERSION}-alpine

# -----------------------------------------------------------------------------
# Shared: base image with pnpm
# -----------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base

WORKDIR /app

# pnpm comes from npm at the version pinned by the root package.json
# `packageManager` field (the pin pnpm/action-setup reads in CI), minus any
# `+sha` suffix. Node 25+ images no longer ship corepack.
COPY package.json ./
RUN npm install -g --no-fund --no-audit "$(node -p "require('./package.json').packageManager.split('+')[0]")"

# -----------------------------------------------------------------------------
# Shared: production runtime base (non-root user, release metadata)
# -----------------------------------------------------------------------------
# The process can read its code and dependencies but not rewrite them: files a production stage copies stay root's.
FROM ${NODE_IMAGE} AS runtime

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
# Shared: workspace manifests for dependency installs
# -----------------------------------------------------------------------------
# One stage for all services: each install below is scoped by `--filter`, and
# pnpm-lock.yaml pins resolution, so unused manifests can't change what gets
# installed: they only ride along for the workspace layout.
FROM base AS manifests

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm refuses the install when a file `patchedDependencies` names is missing,
# even for a package the filter skips. The glob lets an app without patches build too.
COPY patche[s] ./patches/
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY sdk/package.json ./sdk/
COPY cdc/package.json ./cdc/
COPY yjs/package.json ./yjs/

# =============================================================================
# backend: Hono API server
# =============================================================================

# Install production dependencies only; none of them needs its install script. The filter has no `...`: that would
# follow workspace links, devDependencies included, and install the `dependencies` of shared, sdk, cdc and yjs too,
# which the bundle inlines.
FROM manifests AS backend-deps

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter backend

# Install all dependencies (including dev for build) and build with rolldown
FROM manifests AS backend-builder

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter backend...

# Every workspace tsconfig extends the root one, and the build stops without it.
COPY tsconfig.json ./
COPY backend/ ./backend/
COPY shared/ ./shared/
COPY cdc/ ./cdc/
COPY yjs/ ./yjs/

WORKDIR /app/backend
RUN pnpm build

# Production image
FROM runtime AS backend

# Built application
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package.json ./backend/

# Production dependencies
COPY --from=backend-deps /app/node_modules ./node_modules
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules

# Drizzle migrations
COPY backend/drizzle ./backend/drizzle

# GeoIP databases download here at runtime (backend/src/lib/geoip.ts); the image ships none.
USER root
RUN mkdir -p backend/geoip && chown app:app backend/geoip
USER app

EXPOSE 4000

WORKDIR /app/backend
# The passkey library asks Web Crypto which algorithms it supports at load, which Node 26 answers with experimental warnings.
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/main.js"]

# =============================================================================
# cdc: Change Data Capture worker
# =============================================================================

# Install production dependencies only; none of them needs its install script.
FROM manifests AS cdc-deps

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter cdc-worker

# Install all dependencies (including dev for build) and build with rolldown
# Install cdc and shared deps; backend deps needed for bundling backend/src imports
FROM manifests AS cdc-builder

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter cdc-worker... --filter backend...

COPY tsconfig.json ./
COPY cdc/ ./cdc/
COPY backend/src ./backend/src
COPY shared/ ./shared/

WORKDIR /app/cdc
RUN pnpm build

# Production image
FROM runtime AS cdc

COPY --from=cdc-builder /app/cdc/dist ./cdc/dist
COPY --from=cdc-builder /app/cdc/package.json ./cdc/

COPY --from=cdc-deps /app/node_modules ./node_modules
COPY --from=cdc-deps /app/cdc/node_modules ./cdc/node_modules

WORKDIR /app/cdc
CMD ["node", "dist/cdc-worker.js"]

# =============================================================================
# yjs: collaborative editing relay worker
# =============================================================================

# Install production dependencies only; none of them needs its install script.
FROM manifests AS yjs-deps

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter yjs-worker

# Install all dependencies (including dev for build) and build with rolldown
# Install yjs and shared deps; backend deps needed for bundling backend/src imports
FROM manifests AS yjs-builder

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter yjs-worker... --filter backend...

COPY tsconfig.json ./
COPY yjs/ ./yjs/
COPY backend/src ./backend/src
COPY shared/ ./shared/

WORKDIR /app/yjs
RUN pnpm build

# Production image
FROM runtime AS yjs

COPY --from=yjs-builder /app/yjs/dist ./yjs/dist
COPY --from=yjs-builder /app/yjs/package.json ./yjs/

COPY --from=yjs-deps /app/node_modules ./node_modules
COPY --from=yjs-deps /app/yjs/node_modules ./yjs/node_modules

# WebSocket port
EXPOSE 4002

WORKDIR /app/yjs
# lib0 probes localStorage at load; without Web Storage it uses its in-memory store and Node 26 prints no warning.
CMD ["node", "--no-experimental-webstorage", "dist/yjs-worker.js"]
