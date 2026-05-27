# =============================================================================
# CDC Worker - Production Dockerfile
# =============================================================================
# Lightweight Node.js 24 container for CDC (Change Data Capture) worker
# Connects to PostgreSQL logical replication and forwards to backend WebSocket
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
COPY cdc/package.json ./cdc/
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY sdk/package.json ./sdk/

# Install production dependencies only (--ignore-scripts avoids native build issues)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter cdc...

# -----------------------------------------------------------------------------
# Stage 3: Build application
# -----------------------------------------------------------------------------
FROM base AS builder

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY cdc/package.json ./cdc/
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY sdk/package.json ./sdk/

# Install all dependencies (including dev for build)
# Install cdc and shared deps; backend deps needed for bundling backend/src imports
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter cdc... --filter backend...

# Copy source code
COPY cdc/ ./cdc/
COPY backend/src ./backend/src
COPY shared/ ./shared/
COPY sdk/ ./sdk/

# Build CDC worker (bundles backend imports via tsup)
WORKDIR /app/cdc
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 4: Production image
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/cdc/dist ./cdc/dist
COPY --from=builder /app/cdc/package.json ./cdc/

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/cdc/node_modules ./cdc/node_modules

# Set ownership
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Environment variables
ENV NODE_ENV=production

# Start the CDC worker
WORKDIR /app/cdc
CMD ["node", "dist/cdc-worker.js"]