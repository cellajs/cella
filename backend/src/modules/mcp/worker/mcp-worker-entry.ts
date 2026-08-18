import { type ServerType, serve } from '@hono/node-server';
import { appConfig } from 'shared';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { getPgBoss, stopPgBoss } from '#/lib/pg-boss';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';
import '#/modules'; // composition root: registers every backend module (this worker mounts only mcp routes)
import { mcpHandlers } from '#/modules/mcp/mcp-handlers';
import { baseApp } from '#/server';

const port = Number(env.PORT ?? '4003');

export async function startMcpWorker(): Promise<void> {
  const hasApiKey = !!env.SCW_AI_API_KEY;

  if (appConfig.services.mcp.enabled === false) {
    baseLog.info('MCP server disabled by appConfig');
    return;
  }

  if (!hasApiKey) {
    baseLog.info('SCW_AI_API_KEY not set, running as no-op (health-only)');
  }

  if (hasApiKey) {
    otel.start();
    otel.verifyConnection();

    // Wait for the API to be ready (it owns migrations)
    if (env.NODE_ENV === 'development') {
      await waitForBackend(2000, 60_000);
    }

    baseApp.route('/:tenantId/:organizationId/mcp', mcpHandlers);

    await getPgBoss();
    baseLog.info('pg-boss started, queues ready');
  }

  let server: ServerType | undefined;

  server = serve(
    {
      fetch: baseApp.fetch,
      hostname: '0.0.0.0',
      port,
    },
    () => {
      baseLog.info(`MCP service listening on port ${port}${hasApiKey ? '' : ' (no-op)'}`);
    },
  );

  setupGracefulShutdown({
    name: 'mcp-worker',
    cleanup: async () => {
      if (server) server.close();
      if (hasApiKey) await stopPgBoss();
      if (hasApiKey) await otel.shutdown();
    },
    log: (msg) => baseLog.info(msg),
  });
}
