import { sql } from 'drizzle-orm';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { renderAscii } from 'shared/utils/ascii';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { registerOpenApiDocs } from '#/core/openapi-registration';
import { baseDb } from '#/db/db';
import '#/lib/i18n';
import process from 'node:process';
import { startGeoipRefresh } from '#/lib/geoip';
import { serveApi, serveInternal } from '#/lib/listeners';
import { stopPgBoss } from '#/lib/pg-boss';
import { otel } from '#/lib/tracing';
import { baseApp as app } from '#/routes';
import { timestamp } from '#/utils/console';
import { env } from './env';

otel.start();
otel.verifyConnection();

let server: import('@hono/node-server').ServerType | undefined;
let internalListener: ReturnType<typeof serveInternal> | undefined;
/** Stops what this process starts besides its listeners: the GeoIP refresh. */
const stops: (() => unknown)[] = [];

const startTunnel = appConfig.mode === 'tunnel' ? (await import('../scripts/start-tunnel')).startTunnel : () => null;

await registerOpenApiDocs(app);

const main = async () => {
  const port = env.PORT;
  console.info(`${timestamp()} [startup] mode=${appConfig.mode} nodb=${env.NODB} port=${port}`);

  try {
    if (!env.NODB) await baseDb.execute(sql`SELECT 1`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not connect to PostgreSQL. Is Docker running? Try: pnpm docker\n  Original error: ${msg}`);
  }

  if (env.RUN_MIGRATIONS_ON_BOOT) {
    // The only API path that touches the admin credential; production runs migrations as MODE=migrate.
    const { migrateDatabase } = await import('../scripts/db/migrate-database');
    console.info(`${timestamp()} [startup] Running migrations...`);
    await migrateDatabase('boot-time migrations (RUN_MIGRATIONS_ON_BOOT)');

    console.info(`${timestamp()} [startup] Migrations complete, starting server...`);
  } else {
    console.info(`${timestamp()} [startup] RUN_MIGRATIONS_ON_BOOT=false: skipping migrations (run as MODE=migrate)`);
  }

  // Per process, not a scheduled job: every replica keeps its own GeoIP copy current.
  stops.push(startGeoipRefresh());

  // Server-to-server routes (the CDC socket, the Yjs relay) listen apart from the public API.
  internalListener = serveInternal({ port: env.INTERNAL_PORT });

  server = serveApi({ fetch: app.fetch, port }, async () => {
    // Single-VM: this API process also runs every enabled service in-process, through each subsystem's own start().
    if (appConfig.singleVM) {
      if (appConfig.services.cdc.enabled) {
        console.info(`${timestamp()} [startup] singleVM + cdc: this process takes the replication slot once the previous generation releases it`);
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
          inProcess: true,
        });
      if (appConfig.services.oauth.enabled)
        await (await import('#/modules/oauth-server/worker/oauth-worker-entry')).startOauthServer({
          port: appConfig.devPorts.oauth,
          inProcess: true,
        });
      // The folded jobs worker needs no port: this process's /health carries the jobs component.
      if (appConfig.services.jobs.enabled) await (await import('#/lib/jobs-worker')).startJobsWorker({ inProcess: true });
    }

    const tunnelUrl = await startTunnel();

    renderAscii();
    console.info(' ');

    console.info(`${pc.bold(pc.greenBright(appConfig.name))} 
Frontend: ${pc.bold(pc.cyanBright(appConfig.frontendUrl))} 
Backend: ${pc.bold(pc.cyanBright(appConfig.backendUrl))} 
Tunnel: ${pc.bold(pc.magentaBright(tunnelUrl || '-'))}`);

    console.info(' ');
  });
};

setupGracefulShutdown({
  name: 'api',
  cleanup: async () => {
    for (const stop of stops) await stop();
    await stopPgBoss();
    if (server) {
      server.close();
    }
    internalListener?.close();
    await otel.shutdown();
  },
  log: (msg) => process.stderr.write(`[api] ${msg}\n`),
});

main().catch((e) => {
  process.stderr.write(`[startup] Failed to start server: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
