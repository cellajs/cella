# Hono Proxy Plan

This document outlines a plan to create a lightweight Hono proxy server that unifies the API, CDC health endpoints, and static frontend under a single domain.

## Current state

Cella currently runs as separate services on different ports/domains:

| Service | Port (dev) | Production URL | Purpose |
|---------|------------|----------------|---------|
| Backend API | 4000 | api.cellajs.com | Hono API server |
| CDC Worker | 4001 | (internal) | Health/metrics endpoints |
| Frontend | 3000 | cellajs.com | Vite dev / static build |

**Issues with current setup:**
- Requires CORS configuration between frontend and API
- Multiple DNS records and SSL certificates needed
- Cookie handling complexity (domain matching)
- CDC health endpoints not externally accessible
- More complex deployment (multiple services, ports)

## Goals

1. **Single domain** - Serve everything from `cellajs.com`
2. **Simplified deployment** - One entry point for all traffic
3. **No CORS needed** - Same-origin requests
4. **Unified health checks** - Single `/health` aggregating all services
5. **Cookie simplicity** - No cross-domain cookie issues
6. **Keep services independent** - Proxy doesn't replace, it routes

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

## Routing rules

| Path | Target | Notes |
|------|--------|-------|
| `/api/*` | Backend API (localhost:4000) | Strip `/api` prefix → `/` |
| `/cdc/health` | CDC Worker (localhost:4001/health) | Health check |
| `/cdc/metrics` | CDC Worker (localhost:4001/metrics) | Metrics |
| `/health` | Aggregated health | Combines API + CDC + proxy |
| `/*` | Static files / Frontend | Serve from dist or CDN |

## Implementation plan

### Phase 1: Create proxy workspace

**New workspace:** `proxy/`

```
proxy/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          # Entry point
    ├── env.ts            # Environment config
    ├── server.ts         # Hono app setup
    ├── routes/
    │   ├── api.ts        # API proxy routes
    │   ├── cdc.ts        # CDC proxy routes
    │   ├── health.ts     # Aggregated health
    │   └── static.ts     # Static file serving
    └── lib/
        └── proxy.ts      # Proxy helper utilities
```

**package.json:**
```json
{
  "name": "@cella/proxy",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "hono": "^4.x",
    "pino": "^9.x",
    "pino-pretty": "^11.x",
    "config": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.x",
    "tsx": "^4.x",
    "typescript": "^5.x"
  }
}
```

### Phase 2: Core proxy implementation

**src/server.ts:**
```typescript
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { logger } from 'hono/logger';
import { apiProxy } from './routes/api';
import { cdcProxy } from './routes/cdc';
import { healthRoutes } from './routes/health';
import { staticRoutes } from './routes/static';

const app = new Hono();

// Global middleware
app.use('*', secureHeaders());
app.use('*', compress());
app.use('*', logger());

// Route handlers
app.route('/api', apiProxy);
app.route('/cdc', cdcProxy);
app.route('/health', healthRoutes);
app.route('/', staticRoutes);

export default app;
```

### Phase 3: API proxy route

**src/routes/api.ts:**
```typescript
import { Hono } from 'hono';
import { env } from '../env';

const app = new Hono();

/**
 * Proxy all /api/* requests to the backend API.
 * Strips the /api prefix before forwarding.
 */
app.all('/*', async (c) => {
  const path = c.req.path.replace(/^\/api/, '') || '/';
  const url = new URL(path, env.API_URL);
  url.search = new URL(c.req.url).search;

  const headers = new Headers(c.req.raw.headers);
  // Forward original host for proper URL generation
  headers.set('X-Forwarded-Host', c.req.header('host') ?? '');
  headers.set('X-Forwarded-Proto', 'https');

  const response = await fetch(url.toString(), {
    method: c.req.method,
    headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' 
      ? c.req.raw.body 
      : undefined,
    // @ts-expect-error - duplex required for streaming
    duplex: 'half',
  });

  // Forward response with headers
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

export { app as apiProxy };
```

### Phase 4: CDC proxy route

**src/routes/cdc.ts:**
```typescript
import { Hono } from 'hono';
import { env } from '../env';

const app = new Hono();

/**
 * Proxy CDC health and metrics endpoints.
 */
app.get('/health', async (c) => {
  try {
    const response = await fetch(`${env.CDC_URL}/health`);
    const data = await response.json();
    return c.json(data, response.status);
  } catch (error) {
    return c.json({ status: 'unreachable', error: 'CDC service unavailable' }, 503);
  }
});

app.get('/metrics', async (c) => {
  try {
    const response = await fetch(`${env.CDC_URL}/metrics`);
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: 'CDC metrics unavailable' }, 503);
  }
});

export { app as cdcProxy };
```

### Phase 5: Aggregated health endpoint

**src/routes/health.ts:**
```typescript
import { Hono } from 'hono';
import { env } from '../env';

const app = new Hono();

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
}

interface AggregatedHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    proxy: ServiceHealth;
    api: ServiceHealth;
    cdc: ServiceHealth;
  };
  timestamp: string;
}

async function checkService(url: string): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(5000) 
    });
    const latency = Date.now() - start;
    
    if (response.ok) {
      return { status: 'healthy', latency };
    }
    return { status: 'degraded', latency, error: `HTTP ${response.status}` };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Aggregated health check combining all services.
 */
app.get('/', async (c) => {
  const [apiHealth, cdcHealth] = await Promise.all([
    checkService(`${env.API_URL}/ping`),
    checkService(`${env.CDC_URL}/health`),
  ]);

  const services = {
    proxy: { status: 'healthy' as const },
    api: apiHealth,
    cdc: cdcHealth,
  };

  // Overall status: unhealthy if API down, degraded if CDC down
  let overallStatus: AggregatedHealth['status'] = 'healthy';
  if (apiHealth.status === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if (cdcHealth.status !== 'healthy' || apiHealth.status === 'degraded') {
    overallStatus = 'degraded';
  }

  const health: AggregatedHealth = {
    status: overallStatus,
    services,
    timestamp: new Date().toISOString(),
  };

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;
  return c.json(health, httpStatus);
});

export { app as healthRoutes };
```

### Phase 6: Static file serving

**src/routes/static.ts:**
```typescript
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun'; // or '@hono/node-server/serve-static'
import { env } from '../env';

const app = new Hono();

if (env.NODE_ENV === 'production') {
  // Serve pre-built static files in production
  app.use('/*', serveStatic({ 
    root: env.STATIC_DIR,
    // SPA fallback - serve index.html for client-side routing
    onNotFound: (c) => {
      return c.redirect('/');
    },
  }));

  // SPA fallback for client-side routing
  app.get('*', serveStatic({ 
    root: env.STATIC_DIR, 
    path: 'index.html' 
  }));
} else {
  // In development, proxy to Vite dev server
  app.all('/*', async (c) => {
    const url = new URL(c.req.path, env.VITE_DEV_URL);
    url.search = new URL(c.req.url).search;

    const response = await fetch(url.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' 
        ? c.req.raw.body 
        : undefined,
      // @ts-expect-error - duplex required for streaming
      duplex: 'half',
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  });
}

export { app as staticRoutes };
```

### Phase 7: Environment configuration

**src/env.ts:**
```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Proxy server port
  PROXY_PORT: z.coerce.number().default(8000),
  
  // Backend API URL
  API_URL: z.string().url().default('http://localhost:4000'),
  
  // CDC Worker URL
  CDC_URL: z.string().url().default('http://localhost:4001'),
  
  // Vite dev server (development only)
  VITE_DEV_URL: z.string().url().default('http://localhost:3000'),
  
  // Static files directory (production only)
  STATIC_DIR: z.string().default('../frontend/dist'),
});

export const env = envSchema.parse(process.env);
```

### Phase 8: Entry point

**src/index.ts:**
```typescript
import { serve } from '@hono/node-server';
import { env } from './env';
import app from './server';
import { logEvent } from './pino';

// Graceful shutdown
let server: ReturnType<typeof serve>;

process.on('SIGINT', () => {
  logEvent('info', 'Received SIGINT, shutting down proxy...');
  server?.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logEvent('info', 'Received SIGTERM, shutting down proxy...');
  server?.close();
  process.exit(0);
});

// Start server
server = serve({
  fetch: app.fetch,
  port: env.PROXY_PORT,
});

logEvent('info', 'Hono proxy started', {
  port: env.PROXY_PORT,
  apiUrl: env.API_URL,
  cdcUrl: env.CDC_URL,
  mode: env.NODE_ENV,
});
```

## Configuration changes

### Update config/default.ts

```typescript
// Before
frontendUrl: 'https://cellajs.com',
backendUrl: 'https://api.cellajs.com',

// After (when using proxy)
frontendUrl: 'https://cellajs.com',
backendUrl: 'https://cellajs.com/api',  // Same domain, /api prefix
```

### Update frontend API client

The frontend API client base URL changes from `https://api.cellajs.com` to `/api` (relative):

```typescript
// frontend/src/lib/api-client.ts
const baseUrl = import.meta.env.DEV 
  ? 'http://localhost:8000/api'  // Proxy in dev
  : '/api';                       // Relative in production
```

## Docker / Compose integration

**Add to compose.yaml:**
```yaml
services:
  proxy:
    container_name: cella_proxy
    build:
      context: ./proxy
      dockerfile: Dockerfile
    ports:
      - 8000:8000
    environment:
      - NODE_ENV=production
      - API_URL=http://backend:4000
      - CDC_URL=http://cdc:4001
      - STATIC_DIR=/app/static
    volumes:
      - ./frontend/dist:/app/static:ro
    depends_on:
      - backend
      - cdc
```

## Development workflow

```bash
# Terminal 1: Start backend
cd backend && pnpm dev

# Terminal 2: Start CDC (if DEV_MODE=full)
cd cdc && pnpm dev

# Terminal 3: Start Vite dev server
cd frontend && pnpm dev

# Terminal 4: Start proxy
cd proxy && pnpm dev

# Access everything at http://localhost:8000
```

Or with a combined script in root `package.json`:

```json
{
  "scripts": {
    "dev:proxy": "concurrently \"pnpm --filter backend dev\" \"pnpm --filter cdc dev\" \"pnpm --filter frontend dev\" \"pnpm --filter proxy dev\""
  }
}
```

## Benefits summary

| Benefit | Description |
|---------|-------------|
| **No CORS** | Same-origin requests eliminate CORS configuration |
| **Simplified cookies** | No cross-domain cookie issues, simpler auth |
| **Single SSL cert** | One certificate for entire domain |
| **Unified health** | Single `/health` endpoint for monitoring |
| **Cleaner URLs** | `cellajs.com/api` instead of `api.cellajs.com` |
| **Easier deployment** | One entry point, internal service discovery |
| **WebSocket support** | Proxy can handle WS upgrade for real-time |

## WebSocket proxy (optional)

If WebSocket connections need to go through the proxy:

```typescript
// src/routes/api.ts - WebSocket upgrade handling
import { upgradeWebSocket } from 'hono/cloudflare-workers'; // or node adapter

app.get('/ws/*', upgradeWebSocket((c) => ({
  onOpen(event, ws) {
    // Connect to backend WebSocket
    const backendWs = new WebSocket(`${env.API_WS_URL}${c.req.path}`);
    // Forward messages bidirectionally
  },
  onMessage(event, ws) {
    // Forward to backend
  },
})));
```

## What NOT to include

- ❌ Request transformation/modification (keep it simple proxy)
- ❌ Caching layer (let CDN handle this)
- ❌ Rate limiting (handle at edge/CDN level)
- ❌ Authentication (backend handles this)
- ❌ Complex load balancing (use proper LB if needed)

## Migration path

1. **Phase A**: Deploy proxy alongside existing setup, test internally
2. **Phase B**: Update DNS to point to proxy, keep old endpoints alive
3. **Phase C**: Update frontend to use `/api` prefix
4. **Phase D**: Remove old `api.` subdomain DNS record
5. **Phase E**: Clean up CORS configuration from backend

## File structure summary

```
cella/
├── backend/          # API server (:4000)
├── cdc/              # CDC worker (:4001)
├── frontend/         # React SPA (:3000 dev, static prod)
├── proxy/            # NEW: Hono proxy (:8000)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── env.ts
│       ├── pino.ts
│       ├── server.ts
│       └── routes/
│           ├── api.ts
│           ├── cdc.ts
│           ├── health.ts
│           └── static.ts
└── ...
```
