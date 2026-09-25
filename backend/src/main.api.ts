import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { renderAscii } from 'shared/utils/ascii';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { registerOpenApiDocs } from '#/core/openapi-registration';
import { baseDb, getAdminDb, migrateConfig } from '#/db/db';
import '#/lib/i18n';
import process from 'node:process';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import { startGeoipRefresh } from '#/lib/geoip';
import { startJobOwnership } from '#/lib/job-ownership';
import { getBackendJobs } from '#/lib/module';
import { otel } from '#/lib/tracing';
import { listenForAuthInvalidation } from '#/middlewares/guard/invalidation-listener';
import { registerCacheInvalidation } from '#/middlewares/product-cache/cache-invalidation';
import { baseApp as app } from '#/routes';
import { timestamp } from '#/utils/console';
import { env } from './env';

otel.start();
otel.verifyConnection();

let server: import('@hono/node-server').ServerType | undefined;
const stopJobs: (() => void)[] = [];

const startTunnel = appConfig.mode === 'tunnel' ? (await import('../scripts/start-tunnel')).startTunnel : () => null;

await registerOpenApiDocs(app);

const main = async () => {
  const port = Number(env.PORT ?? '4000');
  console.info(`${timestamp()} [startup] mode=${appConfig.mode} nodb=${env.NODB} port=${port}`);

  try {
    if (!env.NODB) await baseDb.execute(sql`SELECT 1`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not connect to PostgreSQL. Is Docker running? Try: pnpm docker\n  Original error: ${msg}`);
  }

  if (env.RUN_MIGRATIONS_ON_BOOT) {
    // The only API path that touches the admin credential; production runs migrations as MODE=migrate.
    const migrationDb = getAdminDb('boot-time migrations (RUN_MIGRATIONS_ON_BOOT)');
    const { createDbRoles } = await import('../scripts/db/create-db-roles');
    await createDbRoles();

    console.info(`${timestamp()} [startup] Running migrations...`);
    await pgMigrate(migrationDb, migrateConfig);
    const { schedulePartitionMaintenance } = await import('../scripts/db/schedule-partition-maintenance');
    await schedulePartitionMaintenance();

    console.info(`${timestamp()} [startup] Migrations complete, starting server...`);
  } else {
    console.info(`${timestamp()} [startup] RUN_MIGRATIONS_ON_BOOT=false: skipping migrations (run as MODE=migrate)`);
  }

  // One instance runs the scheduled jobs: every RUN_JOBS instance contends for an advisory lock, also across a rollout.
  if (env.RUN_JOBS && !env.NODB) {
    const jobs = getBackendJobs();
    stopJobs.push(startJobOwnership({ jobs }));
    console.info(`${timestamp()} [startup] scheduled jobs: ${jobs.map((job) => job.name).join(', ') || 'none'}`);
  }

  registerCacheInvalidation();
  stopJobs.push(listenForAuthInvalidation());

  // Per process, not a scheduled job: every replica keeps its own GeoIP copy current.
  stopJobs.push(startGeoipRefresh());

  server = serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port,
      serverOptions: { keepAlive: true, keepAliveTimeout: 30_000 },
    },
    async () => {
      if (server && 'headersTimeout' in server) {
        server.headersTimeout = 60_000;
        server.requestTimeout = 30_000;
      }

      cdcWebSocketServer.attachToServer(server!);

      // Single-VM: this API process also runs every enabled service in-process, through each subsystem's own start().
      if (appConfig.singleVM) {
        if (appConfig.services.cdc.enabled) {
          console.warn(
            `${timestamp()} [startup] singleVM + cdc: API holds the replication slot, deploy must be exclusive (no blue-green)`,
          );
          // The replication loop never resolves, so detach it and log failures to prevent unhandled rejections.
          void (await import('cdc-worker')).runCdcWorker().catch((error) => {
            console.error(`${timestamp()} [startup] in-process cdc worker crashed:`, error);
          });
        }
        if (appConfig.services.yjs.enabled) await (await import('yjs-worker')).startYjsWorker();
        (await import('#/modules/yjs/yjs-materializers')).warnWhenNoYjsMaterializer();
        // Folded workers listen on their own ports (the LB routes each path to the host VM on that port); the API
        // process keeps PORT for itself.
        if (appConfig.services.mcp.enabled)
          await (await import('#/modules/mcp/worker/mcp-worker-entry')).startMcpWorker({
            port: appConfig.devPorts.mcp,
          });
        if (appConfig.services.oauth.enabled)
          await (await import('#/modules/oauth-server/worker/oauth-worker-entry')).startOauthServer({
            port: appConfig.devPorts.oauth,
            inProcess: true,
          });
      }

      const tunnelUrl = await startTunnel();

      renderAscii();
      console.info(' ');

      console.info(`${pc.bold(pc.greenBright(appConfig.name))} 
Frontend: ${pc.bold(pc.cyanBright(appConfig.frontendUrl))} 
Backend: ${pc.bold(pc.cyanBright(appConfig.backendUrl))} 
Tunnel: ${pc.bold(pc.magentaBright(tunnelUrl || '-'))}`);

      console.info(' ');
    },
  );
};

setupGracefulShutdown({
  name: 'api',
  cleanup: async () => {
    for (const stop of stopJobs) stop();
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
