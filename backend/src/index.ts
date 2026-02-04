import { db, migrateConfig } from '#/db/db';
import docs from '#/docs/docs';
import '#/lib/i18n';
import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import pc from 'picocolors';
import { appConfig, hierarchy, validatePublicProductEntities } from 'shared';
import app from '#/routes';
import { registerCacheInvalidation } from '#/sync/cache-invalidation';
import { cdcWebSocketServer } from '#/sync/cdc-websocket';
import { ascii } from '#/utils/ascii';
import { env } from './env';

// import { sdk } from './tracing';

const startTunnel = appConfig.mode === 'tunnel' ? (await import('#/lib/start-tunnel')).default : () => null;

const isPGliteDatabase = (_db: unknown): _db is PgliteDatabase => env.DEV_MODE === 'basic';

// Init OpenAPI docs
docs(app);

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
  // Validate public product entity configuration (security check)
  validatePublicProductEntities(hierarchy, appConfig.publicProductEntityTypes);

  // Migrate db
  if (isPGliteDatabase(db)) {
    await pgliteMigrate(db, migrateConfig);
  } else {
    await pgMigrate(db, migrateConfig);
  }

  // Register entity cache invalidation hook
  registerCacheInvalidation();

  // Start server with WebSocket support for CDC Worker
  const server = serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port: Number(env.PORT ?? '4000'),
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
  console.error('Failed to start server');
  console.error(e);
  process.exit(1);
});
