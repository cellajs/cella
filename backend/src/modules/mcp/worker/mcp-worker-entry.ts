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

/**
 * The MCP face as its own process: the tool endpoint and its protected-resource metadata, behind tokens from the
 * authorization server. Needs no AI credential; `SCW_AI_API_KEY` only switches the app's own AI features on.
 */
export async function startMcpWorker(options: { port?: number } = {}): Promise<void> {
  const port = options.port ?? Number(env.PORT);
  if (appConfig.services.mcp.enabled === false) {
    baseLog.info('MCP server disabled by appConfig');
    return;
  }

  const hasAiKey = !!env.SCW_AI_API_KEY;
  otel.start();
  otel.verifyConnection();

  // Wait for the API to be ready (it owns migrations)
  if (env.NODE_ENV === 'development') await waitForBackend(2000, 60_000);

  baseApp.route('/:tenantId/:organizationId/mcp', mcpHandlers);

  if (hasAiKey) {
    await getPgBoss();
    baseLog.info('pg-boss started, queues ready');
  }

  const server: ServerType = serve({ fetch: baseApp.fetch, hostname: '0.0.0.0', port }, () => {
    baseLog.info(`MCP service listening on port ${port}${hasAiKey ? '' : ' (AI features off)'}`);
  });

  setupGracefulShutdown({
    name: 'mcp-worker',
    cleanup: async () => {
      server.close();
      if (hasAiKey) await stopPgBoss();
      await otel.shutdown();
    },
    log: (msg) => baseLog.info(msg),
  });
}
