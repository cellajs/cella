# CDC Hono Migration Plan

This document outlines the plan to convert the CDC worker into a lightweight Hono server, benefiting from patterns established in the backend.

## Current state

The CDC worker currently:
- Uses raw Node.js `http.createServer()` for health/metrics endpoints ([health.ts](../cdc/src/health.ts))
- Has its own custom `logEvent` function imported from backend via path alias
- Manually handles WebSocket connections and replication logic
- Has basic env validation with Zod

## Goals

1. **Consistent logging** - Use pino like backend (structured JSON logs, log levels, redaction)
2. **Consistent error handling** - Use AppError pattern for structured errors
3. **Better HTTP routing** - Replace raw `http.createServer` with Hono for cleaner routing
4. **Middleware reuse** - Share patterns like secure headers, CORS (if needed)
5. **Keep it simple** - CDC is a focused worker, don't over-engineer

## Benefits of Hono

| Benefit | Description |
|---------|-------------|
| **Pino integration** | Use `@hono/logger` or custom middleware matching backend `loggerMiddleware` |
| **Structured errors** | Reuse `AppError` class with consistent error responses |
| **Route organization** | Clean route definitions with type safety |
| **Middleware ecosystem** | Access to `hono/secure-headers`, `hono/compress` |
| **Consistency** | Same patterns as backend reduce cognitive load |
| **Future extensibility** | Easy to add new internal endpoints if needed |

## Non-goals

- OpenAPI spec generation (CDC has no public API)
- Complex auth middleware (uses simple shared secret)
- Full middleware stack (no CSRF, body limits, etc. needed)

## Implementation plan

### Phase 1: Add dependencies and setup pino

**Files to modify:**
- [cdc/package.json](../cdc/package.json)

**Add dependencies:**
```json
{
  "dependencies": {
    "hono": "^4.x",
    "pino": "^9.x",
    "pino-pretty": "^11.x"
  }
}
```

### Phase 2: Create shared pino logger

**New file:** `cdc/src/pino.ts`

```typescript
import pino from 'pino';
import { env } from './env';

const isProduction = env.NODE_ENV === 'production';

/**
 * CDC event logger using pino.
 * Matches backend pattern for consistent structured logging.
 */
export const cdcLogger = pino(
  {
    level: isProduction ? 'info' : 'debug',
    name: 'cdc-worker',
  },
  isProduction
    ? undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          ignore: 'pid,hostname',
        },
      }),
);

/**
 * Logs significant CDC events with optional metadata.
 */
export const logEvent = (
  severity: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
  msg: string,
  meta?: object
): void => {
  cdcLogger[severity]({ ...(meta ?? {}), msg });
};
```

### Phase 3: Create lightweight AppError for CDC

**New file:** `cdc/src/lib/error.ts`

```typescript
/**
 * Lightweight error class for CDC worker.
 * Simplified version of backend AppError - no i18n, no complex metadata.
 */
export class CdcError extends Error {
  readonly status: number;
  readonly type: string;
  readonly severity: 'error' | 'warn' | 'fatal';

  constructor(
    status: number,
    type: string,
    message: string,
    severity: 'error' | 'warn' | 'fatal' = 'error'
  ) {
    super(message);
    this.name = 'CdcError';
    this.status = status;
    this.type = type;
    this.severity = severity;
  }
}

/**
 * Hono error handler for CDC endpoints.
 */
export const cdcErrorHandler = (err: Error, c: Context): Response => {
  const isCdcError = err instanceof CdcError;

  const status = isCdcError ? err.status : 500;
  const type = isCdcError ? err.type : 'internal_error';
  const severity = isCdcError ? err.severity : 'error';

  cdcLogger[severity]({
    msg: err.message,
    type,
    status,
    stack: err.stack,
  });

  return c.json({ error: type, message: err.message }, status);
};
```

### Phase 4: Create Hono server for health endpoints

**Refactor file:** `cdc/src/health.ts`

```typescript
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env';
import { cdcLogger, logEvent } from './pino';
import { cdcErrorHandler } from './lib/error';
import { getCdcMetrics } from './tracing';
import { getCdcHealthState } from './worker';

const app = new Hono();

// Minimal middleware
app.use('*', secureHeaders());

// Health check endpoint
app.get('/health', (c) => {
  const cdcState = getCdcHealthState();
  const status = getHealthStatus(cdcState);
  const metrics = getCdcMetrics();

  const response = {
    status,
    wsState: cdcState.wsState,
    replicationState: cdcState.replicationState,
    lastLsn: cdcState.lastLsn,
    lastMessageAt: cdcState.lastMessageAt?.toISOString() ?? null,
    metrics,
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return c.json(response, httpStatus);
});

// Metrics endpoint
app.get('/metrics', (c) => {
  const metrics = getCdcMetrics();
  return c.json(metrics);
});

// Not found handler
app.notFound((c) => c.json({ error: 'not_found' }, 404));

// Error handler
app.onError(cdcErrorHandler);

/**
 * Start the CDC health server.
 */
export function startHealthServer(): void {
  const port = env.CDC_HEALTH_PORT;
  
  Bun.serve({ fetch: app.fetch, port }); // or Node adapter
  // For Node.js: serve(app, { port })
  
  logEvent('info', 'CDC health server started', { port });
}

// Keep existing getHealthStatus function
function getHealthStatus(state: CdcHealthState): HealthStatus {
  // ... existing logic
}
```

### Phase 5: Update imports across CDC files

**Files to update:**
- [cdc/src/index.ts](../cdc/src/index.ts) - Import from local pino
- [cdc/src/worker.ts](../cdc/src/worker.ts) - Import from local pino
- [cdc/src/websocket-client.ts](../cdc/src/websocket-client.ts) - Import from local pino
- [cdc/src/tracing.ts](../cdc/src/tracing.ts) - Import from local pino

Change:
```typescript
// Before
import { logEvent } from '#/utils/logger';

// After
import { logEvent } from './pino';
```

### Phase 6: Optional enhancements

#### 6a. Add request logging middleware (optional)

```typescript
import { logger } from 'hono/logger';

// Simple request logging for health checks
app.use('*', logger());
```

#### 6b. Add graceful shutdown for Hono server

```typescript
let server: ReturnType<typeof serve> | null = null;

export function startHealthServer(): ReturnType<typeof serve> {
  server = serve({ fetch: app.fetch, port: env.CDC_HEALTH_PORT });
  logEvent('info', 'CDC health server started', { port: env.CDC_HEALTH_PORT });
  return server;
}

export async function stopHealthServer(): Promise<void> {
  if (server) {
    server.close();
    logEvent('info', 'CDC health server stopped');
  }
}
```

## File structure after migration

```
cdc/src/
├── env.ts           # (unchanged)
├── constants.ts     # (unchanged)
├── index.ts         # Updated imports
├── pino.ts          # NEW: CDC-specific pino logger
├── health.ts        # Refactored: Hono-based health server
├── worker.ts        # Updated imports
├── websocket-client.ts  # Updated imports
├── tracing.ts       # Updated imports
├── process-message.ts   # Updated imports
├── tables.ts        # (unchanged)
├── types.ts         # (unchanged)
├── lib/
│   └── error.ts     # NEW: CdcError class
├── enrichment/      # (unchanged)
├── handlers/        # (unchanged)
└── utils/           # (unchanged)
```

## Summary of changes

| Change | Effort | Benefit |
|--------|--------|---------|
| Add pino + pino-pretty | Low | Structured logging, log levels, pretty dev output |
| Create local `logEvent` | Low | Remove backend dependency, same API |
| Add CdcError class | Low | Consistent error handling |
| Replace http.createServer with Hono | Medium | Clean routing, middleware, type safety |
| Add secure headers | Low | Security baseline |
| Graceful shutdown | Low | Clean process termination |

## What NOT to add (keep it simple)

- ❌ OpenAPI spec generation (no public API)
- ❌ CORS middleware (internal service only)
- ❌ CSRF protection (not browser-facing)
- ❌ Body limit middleware (no POST endpoints)
- ❌ i18n for errors (worker, not user-facing)
- ❌ Sentry integration (can be added later if needed)
- ❌ Complex context storage (no request-scoped auth)

## Testing considerations

After migration:
1. Verify `/health` endpoint returns correct status codes
2. Verify `/metrics` endpoint returns metrics JSON
3. Verify structured logs appear correctly in both dev and production modes
4. Verify graceful shutdown works properly
5. Run existing CDC integration tests (`pnpm test:full`)
