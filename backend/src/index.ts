import { unsafeInternalDb as db, migrateConfig, migrationDb } from '#/db/db';
import docs from '#/docs/docs';
import '#/lib/i18n';
import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import pc from 'picocolors';
import { appConfig } from 'shared';
import app from '#/routes';
import { registerCacheInvalidation } from '#/sync/cache-invalidation';
import { cdcWebSocketServer } from '#/sync/cdc-websocket';
import { ascii } from '#/utils/ascii';
import { env } from './env';

// import { sdk } from './tracing';

// Catch unhandled errors that bypass try/catch (e.g., DB pool 'error' events)
process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[startup] Unhandled rejection: ${reason instanceof Error ? reason.stack : reason}\n`);
});
process.on('uncaughtException', (err) => {
  process.stderr.write(`[startup] Uncaught exception: ${err.stack ?? err}\n`);
  // Give stderr time to flush before exit
  setTimeout(() => process.exit(1), 500);
});
process.on('SIGTERM', () => {
  process.stderr.write('[startup] Received SIGTERM — process killed (likely by Render timeout)\n');
  setTimeout(() => process.exit(1), 200);
});

const startTunnel = appConfig.mode === 'tunnel' ? (await import('#/lib/start-tunnel')).default : () => null;

const isPGliteDatabase = (_db: unknown): _db is PgliteDatabase => env.DEV_MODE === 'basic';

// Init OpenAPI docs
await docs(app);

// Init monitoring instance
Sentry.init({
  enabled: !!appConfig.sentryDsn,
  dsn: appConfig.sentryDsn,
  debug: appConfig.debug,
  environment: appConfig.mode,
  integrations: [nodeProfilingIntegration()],
  // Tracing to capture 100% of transactions
  tracesSampleRate: 1.0,
  // Set sampling rate for profiling - this is evaluated only once per SDK.init call
  profileSessionSampleRate: 1.0,
  // Trace lifecycle automatically enables profiling during active traces
  profileLifecycle: 'trace',
});

const main = async () => {
  const port = Number(env.PORT ?? '4000');
  console.info(`[startup] mode=${appConfig.mode} devMode=${env.DEV_MODE} port=${port}`);

  // Create db roles if needed (dev only), then migrate
  if (isPGliteDatabase(db)) {
    await pgliteMigrate(db, migrateConfig);
  } else if (migrationDb) {
    // Test DB connectivity before proceeding (fail fast instead of hanging)
    console.info('[startup] Testing database connection...');
    const { sql } = await import('drizzle-orm');
    const connTest = migrationDb.execute(sql`SELECT 1 AS ok`);
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('Database connection timed out after 15s — check DATABASE_ADMIN_URL and network access')),
        15_000,
      ),
    );
    await Promise.race([connTest, timeout]);
    console.info('[startup] Database connected successfully');

    console.info('[startup] Creating DB roles...');
    const { createDbRoles } = await import('../scripts/db/create-db-roles');
    await createDbRoles();
    process.stderr.write('[startup] Running migrations...\n');
    const migratePromise = pgMigrate(migrationDb, migrateConfig);
    const migrateTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Migration timed out after 30s')), 30_000),
    );
    await Promise.race([migratePromise, migrateTimeout]);
    process.stderr.write('[startup] Migrations complete\n');
  } else {
    throw new Error('DATABASE_ADMIN_URL required for migrations');
  }

  console.info('[startup] Migrations complete, starting server...');

  // Register entity cache invalidation hook
  registerCacheInvalidation();

  // Start server with WebSocket support for CDC Worker
  const server = serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port,
    },
    async (info) => {
      // Attach CDC WebSocket server to HTTP server
      cdcWebSocketServer.attachToServer(server);

      const tunnelUrl = await startTunnel(info);

      ascii();
      console.info(' ');

      console.info(`${pc.bold(pc.greenBright(appConfig.name))} 
Frontend: ${pc.bold(pc.cyanBright(appConfig.frontendUrl))} 
Backend: ${pc.bold(pc.cyanBright(appConfig.backendUrl))} 
Tunnel: ${pc.bold(pc.magentaBright(tunnelUrl || '-'))}
Docs: ${pc.cyanBright(`${appConfig.backendUrl}/docs`)}
Storybook: ${pc.cyanBright(`http://localhost:6006/`)}`);

      console.info(' ');
    },
  );
};

// sdk.start();
main().catch((e) => {
  // Use synchronous stderr write to ensure the error is visible before exit
  process.stderr.write(`[startup] Failed to start server: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
