# Hono Proxy

A lightweight Hono-based proxy server that unifies the API, CDC health endpoints, and static frontend under a single domain.

## Overview

This proxy acts as a unified entry point for all Cella services:

| Path | Target | Description |
|------|--------|-------------|
| `/api/*` | Backend API (:4000) | Proxied with `/api` prefix stripped |
| `/cdc/health` | CDC Worker (:4001) | Health check endpoint |
| `/cdc/metrics` | CDC Worker (:4001) | Metrics endpoint |
| `/health` | Aggregated | Combined health of all services |
| `/*` | Frontend | Vite dev server or static files |

## Benefits

- **No CORS** - Same-origin requests eliminate CORS configuration
- **Simplified cookies** - No cross-domain cookie issues
- **Single SSL cert** - One certificate for the entire domain
- **Unified health** - Single `/health` endpoint for monitoring
- **Cleaner URLs** - `cellajs.com/api` instead of `api.cellajs.com`

## Usage

### Development

```bash
# From root - starts all services including proxy
pnpm dev:proxy

# Or run individually
cd proxy && pnpm dev
```

Access everything at http://localhost:8000

### Production

```bash
cd proxy && pnpm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PROXY_PORT` | `8000` | Port the proxy listens on |
| `API_URL` | `http://localhost:4000` | Backend API URL |
| `CDC_URL` | `http://localhost:4001` | CDC Worker URL |
| `VITE_DEV_URL` | `http://localhost:3000` | Vite dev server (dev only) |
| `STATIC_DIR` | `../frontend/dist` | Static files directory (prod only) |
| `HEALTH_CHECK_TIMEOUT` | `5000` | Health check timeout (ms) |
| `LOG_LEVEL` | `info` | Logging level |

## Health Endpoints

### `/health` - Aggregated Health

Returns combined status of all services:

```json
{
  "status": "healthy",
  "services": {
    "proxy": { "status": "healthy" },
    "api": { "status": "healthy", "latency": 12 },
    "cdc": { "status": "healthy", "latency": 5 }
  },
  "timestamp": "2026-01-28T10:00:00.000Z"
}
```

Status logic:
- `healthy` - All services up
- `degraded` - CDC down or API returning non-200
- `unhealthy` - API unreachable (returns 503)

### `/health/live` - Liveness Probe

Simple liveness check - always returns 200 if proxy is running.

### `/health/ready` - Readiness Probe

Returns 200 if API is reachable, 503 otherwise. Use for Kubernetes readiness probes.

## Architecture

```
                    ┌─────────────────────────────────┐
                    │      Hono Proxy (:8000)         │
                    │         cellajs.com             │
                    └─────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Backend API    │  │   CDC Worker    │  │ Static Frontend │
│    (:4000)      │  │    (:4001)      │  │   (files/CDN)   │
│   /api/*        │  │   /cdc/*        │  │      /*         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## File Structure

```
proxy/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts          # Entry point with graceful shutdown
    ├── env.ts            # Environment configuration
    ├── pino.ts           # Logging setup
    ├── server.ts         # Hono app with middleware
    ├── lib/
    │   └── proxy.ts      # Proxy helper utilities
    └── routes/
        ├── api.ts        # /api/* -> Backend
        ├── cdc.ts        # /cdc/* -> CDC Worker
        ├── health.ts     # Aggregated health
        └── static.ts     # Static files / Vite proxy
```
