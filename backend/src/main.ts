import { sql } from 'drizzle-orm';
import { migrateConfig, migrationDb } from '#/db/db';
import initDocs from '#/docs/init-docs';
import '#/lib/i18n';
import { type ServerType, serve } from '@hono/node-server';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { renderAscii } from 'shared/ascii';
import { setupGracefulShutdown } from 'shared/worker-lifecycle';
import app from '#/routes';
import { registerCacheInvalidation } from '#/sync/cache-invalidation';
import { cdcWebSocketServer } from '#/sync/cdc-websocket';
import { timestamp } from '#/utils/console';
import { env } from './env';
import { otel } from './tracing';

otel.start();
otel.verifyConnection();

// Keep a reference so graceful shutdown can close the server
let server: ServerType | undefined;

const startTunnel = appConfig.mode === 'tunnel' ? (await import('../scripts/start-tunnel')).default : () => null;

// Init OpenAPI docs
await initDocs(app);

const main = async () => {
  const port = Number(env.PORT ?? '4000');
  console.info(`${timestamp()} [startup] mode=${appConfig.mode} devMode=${env.DEV_MODE} port=${port}`);

  // Create db roles if needed (dev only), then migrate
  if (!migrationDb) {
    throw new Error('DATABASE_ADMIN_URL required for migrations');
  }

  // Verify database connectivity before any DB work
  try {
    await migrationDb.execute(sql`SELECT 1`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not connect to PostgreSQL. Is Docker running? Try: pnpm docker\n  Original error: ${msg}`);
  }

  const { createDbRoles } = await import('../scripts/db/create-db-roles');
  await createDbRoles();

  console.info(`${timestamp()} [startup] Running migrations...`);
  await pgMigrate(migrationDb, migrateConfig);

  console.info(`${timestamp()} [startup] Migrations complete, starting server...`);

  // Register entity cache invalidation hook
  registerCacheInvalidation();

  // Start server with WebSocket support for CDC Worker
  server = serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port,
    },
    async (info) => {
      // Attach CDC WebSocket server to HTTP server
      cdcWebSocketServer.attachToServer(server!);

      const tunnelUrl = await startTunnel(info);

      renderAscii();
      console.info(' ');

      console.info(`${pc.bold(pc.greenBright(appConfig.name))} 
Frontend: ${pc.bold(pc.cyanBright(appConfig.frontendUrl))} 
Backend: ${pc.bold(pc.cyanBright(appConfig.backendUrl))} 
Tunnel: ${pc.bold(pc.magentaBright(tunnelUrl || '-'))}
Storybook: ${pc.cyanBright(`http://localhost:${Number(new URL(appConfig.frontendUrl).port) + 3006}/`)}`);

      console.info(' ');
    },
  );
};

setupGracefulShutdown({
  name: 'api',
  cleanup: async () => {
    if (server) {
      server.close();
    }
    cdcWebSocketServer.close();
    await otel.shutdown();
  },
  log: (msg) => process.stderr.write(`[api] ${msg}\n`),
});

main().catch((e) => {
  process.stderr.write(`[startup] Failed to start server: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
