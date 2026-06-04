import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { renderAscii } from 'shared/ascii';
import { setupGracefulShutdown } from 'shared/worker-lifecycle';
import initDocs from '#/core/init-docs';
import { migrateConfig, migrationDb } from '#/db/db';
import '#/lib/i18n';
import process from 'node:process';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import { otel } from '#/lib/tracing';
import { registerCacheInvalidation } from '#/middlewares/entity-cache/cache-invalidation';
import app from '#/routes';
import { timestamp } from '#/utils/console';
import { env } from './env';

otel.start();
otel.verifyConnection();

let server: import('@hono/node-server').ServerType | undefined;

const startTunnel = appConfig.mode === 'tunnel' ? (await import('../scripts/start-tunnel')).default : () => null;

// Init OpenAPI docs
await initDocs(app);

const main = async () => {
  const port = Number(env.PORT ?? '4000');
  console.info(`${timestamp()} [startup] mode=${appConfig.mode} nodb=${env.NODB} port=${port}`);

  if (!migrationDb) {
    throw new Error('DATABASE_ADMIN_URL required for migrations');
  }

  try {
    await migrationDb.execute(sql`SELECT 1`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not connect to PostgreSQL. Is Docker running? Try: pnpm docker\n  Original error: ${msg}`);
  }

  const { createDbRoles } = await import('../scripts/db/create-db-roles');

  if (env.RUN_MIGRATIONS_ON_BOOT) {
    await createDbRoles();

    console.info(`${timestamp()} [startup] Running migrations...`);
    await pgMigrate(migrationDb, migrateConfig);

    console.info(`${timestamp()} [startup] Migrations complete, starting server...`);
  } else {
    console.info(`${timestamp()} [startup] RUN_MIGRATIONS_ON_BOOT=false — skipping migrations (run as MODE=migrate)`);
  }

  registerCacheInvalidation();

  server = serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port,
      serverOptions: { keepAlive: true, keepAliveTimeout: 30_000 },
    },
    async (info) => {
      // Tune HTTP server for high-throughput scenarios
      if (server && 'headersTimeout' in server) {
        server.headersTimeout = 60_000;
        server.requestTimeout = 30_000;
      }

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
