# Vite Dev Server Implementation Plan

> **Status: ABANDONED** - The `@hono/vite-dev-server` plugin has significant compatibility issues with Vite 7 and CommonJS packages like `@getbrevo/brevo`. The SSR external configuration is not being respected properly, and there are source map errors.

## Conclusion

The current `tsx --watch` approach with CDC reconnection (which takes ~3 seconds) is acceptable. The CDC Worker already handles reconnection gracefully with exponential backoff.

## Alternative Approaches (Future)

If HMR becomes critical:
1. Wait for `@hono/vite-dev-server` to mature and fix CommonJS compatibility
2. Consider running the CDC WebSocket on a separate persistent process
3. Use `DEV_MODE=core` during most development (no CDC = no reconnection noise)

---

## Original Plan (for reference)

Eliminate full server restarts during backend development so that:
- CDC WebSocket connections remain stable
- Faster feedback loop (module reload vs process restart)
- OpenAPI regeneration only when routes actually change

## Current State

```
backend/
├── src/index.ts          # Entry point: migrations, server start, WebSocket attach
├── src/server.ts         # Base Hono app with middleware
├── src/routes.ts         # Route aggregation
└── package.json          # Uses tsx --watch for dev
```

**Current dev command:**
```bash
tsx --watch-path=src src/index.ts
```

**Problem:** Any file change restarts the entire Node.js process, dropping all connections.

## Target State

```
backend/
├── vite.config.ts        # NEW: Vite config with dev-server plugin
├── src/index.ts          # Entry point for production only
├── src/dev.ts            # NEW: Dev entry for Vite (exports app)
├── src/server.ts         # Base Hono app (unchanged)
├── src/routes.ts         # Route aggregation (unchanged)
└── package.json          # Updated dev command
```

**New dev command:**
```bash
vite --config vite.config.ts
```

---

## Implementation Steps

### Phase 1: Setup Vite Dev Server

#### 1.1 Install dependencies

```bash
cd backend
pnpm add -D @hono/vite-dev-server vite
```

#### 1.2 Create `vite.config.ts`

```ts
import devServer from '@hono/vite-dev-server'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    devServer({
      entry: 'src/app.ts', // New entry that exports the Hono app
      adapter: undefined,  // Using native Node.js
      injectClientScript: false, // No client-side injection needed
    }),
  ],
  server: {
    port: 4000,
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '#': '/src',
    },
  },
  ssr: {
    // Externalize packages that don't work well with Vite's ESM transform
    external: [
      '@electric-sql/pglite',
      'pg',
      'drizzle-orm',
      '@sentry/node',
      '@sentry/profiling-node',
    ],
  },
})
```

#### 1.3 Create `src/app.ts` (dev entry point)

This file exports the Hono app for Vite to serve:

```ts
import app from '#/routes'
import docs from '#/docs/docs'
import '#/lib/i18n'

// Init OpenAPI docs
docs(app)

export default app
```

### Phase 2: Handle Startup Logic

The current `index.ts` has startup logic (migrations, cache registration) that needs special handling.

#### 2.1 Create `src/startup.ts`

Extract one-time initialization:

```ts
import { db, migrateConfig } from '#/db/db'
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator'
import { registerCacheInvalidation } from '#/sync/cache-invalidation'
import { env } from './env'

const isPGliteDatabase = (_db: unknown): _db is PgliteDatabase => env.DEV_MODE === 'basic'

let initialized = false

export async function ensureInitialized() {
  if (initialized) return
  
  // Migrate db
  if (isPGliteDatabase(db)) {
    await pgliteMigrate(db, migrateConfig)
  } else {
    await pgMigrate(db, migrateConfig)
  }

  // Register entity cache invalidation hook
  registerCacheInvalidation()
  
  initialized = true
}
```

#### 2.2 Update `src/app.ts` to call startup

```ts
import app from '#/routes'
import docs from '#/docs/docs'
import '#/lib/i18n'
import { ensureInitialized } from './startup'

// Ensure DB is migrated and cache is registered
await ensureInitialized()

// Init OpenAPI docs
docs(app)

export default app
```

### Phase 3: Handle WebSocket for CDC

**This is the trickiest part.** The CDC WebSocket server currently attaches to the HTTP server instance, but Vite controls the server in dev mode.

#### Option A: Use Vite's server hooks (Recommended)

Vite exposes the underlying server. We can attach WebSocket in Vite config:

```ts
// vite.config.ts
import devServer from '@hono/vite-dev-server'
import { defineConfig } from 'vite'
import { cdcWebSocketServer } from './src/sync/cdc-websocket'

export default defineConfig({
  plugins: [
    devServer({
      entry: 'src/app.ts',
    }),
    {
      name: 'cdc-websocket',
      configureServer(server) {
        // Attach CDC WebSocket to Vite's HTTP server
        server.httpServer?.on('listening', () => {
          cdcWebSocketServer.attachToServer(server.httpServer!)
          console.info('INFO: CDC WebSocket server attached to Vite HTTP server')
        })
      },
    },
  ],
  // ... rest of config
})
```

#### Option B: Run WebSocket on separate port

If Option A has issues, run WebSocket on a different port (e.g., 4001) in dev mode only.

### Phase 4: Update package.json Scripts

```json
{
  "scripts": {
    "dev": "cross-env NODE_ENV=development vite",
    "dev:tsx": "cross-env NODE_ENV=development tsx --watch-path=src src/index.ts",
    "start": "cross-env NODE_ENV=production tsx dist/index.js",
    "build": "cross-env NODE_ENV=production tsup"
  }
}
```

Keep `dev:tsx` as fallback during migration.

### Phase 5: Update CDC Worker Connection

If using Option B (separate WebSocket port), update CDC's default URL:

```ts
// cdc/src/env.ts
API_WS_URL: z.string().url().default(
  process.env.NODE_ENV === 'development' 
    ? 'ws://localhost:4001/internal/cdc'
    : 'ws://localhost:4000/internal/cdc'
),
```

---

## Challenges & Mitigations

| Challenge | Mitigation |
|-----------|------------|
| `#/` path aliases | Configure `resolve.alias` in Vite |
| CommonJS dependencies | Use `ssr.external` to exclude problematic packages |
| WebSocket attachment | Use Vite's `configureServer` hook or separate port |
| Top-level await in startup | Vite supports top-level await in ESM |
| Sentry initialization | Move to startup.ts, ensure it's called once |
| OpenAPI generation on change | Add custom Vite plugin to regenerate on route changes |

---

## Testing Plan

1. **Basic functionality**: Start server, hit `/ping`, verify response
2. **Route changes**: Modify a handler, verify change reflects without restart
3. **WebSocket stability**: Start CDC, modify backend code, verify CDC stays connected
4. **Database operations**: Verify migrations run once on startup
5. **OpenAPI generation**: Verify docs update when routes change
6. **Production build**: Ensure `pnpm build` still works with tsup

---

## Rollback Plan

If issues arise:
1. Keep `dev:tsx` script as backup
2. Original `index.ts` remains unchanged for production
3. Vite config is additive, doesn't break existing setup

---

## Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1: Setup | 30 min | Low |
| Phase 2: Startup logic | 1 hour | Low |
| Phase 3: WebSocket | 1-2 hours | Medium |
| Phase 4: Scripts | 15 min | Low |
| Phase 5: CDC update | 15 min | Low |
| Testing | 1 hour | - |

**Total: 4-5 hours**

---

## Decision Points

Before proceeding, confirm:

1. **WebSocket approach**: Option A (Vite hook) or Option B (separate port)?
2. **Fallback period**: How long to keep `dev:tsx` as backup?
3. **CDC awareness**: Should CDC detect Vite dev mode and adjust behavior?

---

## References

- [@hono/vite-dev-server](https://github.com/honojs/vite-plugins/tree/main/packages/dev-server)
- [Vite SSR](https://vitejs.dev/guide/ssr.html)
- [Vite configureServer hook](https://vitejs.dev/guide/api-plugin.html#configureserver)
