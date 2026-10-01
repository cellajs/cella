import { type ServerType, serve } from '@hono/node-server';
import { appConfig } from 'shared';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';
import { listenForAuthInvalidation } from '#/middlewares/guard/invalidation-listener';
import '#/modules'; // composition root: registers every backend module (this worker serves only mcp routes; tool calls run through `#/routes`)
import { mcpHandlers } from '#/modules/mcp/mcp-handlers';
import { createBaseApp } from '#/server';

/**
 * The MCP face as its own process: the tool endpoint and its protected-resource metadata, behind tokens from the
 * authorization server. Needs no AI credential; `SCW_AI_API_KEY` only switches the app's own AI features on. Under
 * singleVM the API process calls this with the mcp port and `inProcess`: telemetry and the wait for the API are its own.
 */
export async function startMcpWorker(options: { port?: number; inProcess?: boolean } = {}): Promise<void> {
  const port = options.port ?? Number(env.PORT);
  if (appConfig.services.mcp.enabled === false) {
    baseLog.info('MCP server disabled by appConfig');
    return;
  }

  const hasAiKey = !!env.SCW_AI_API_KEY;
  if (!options.inProcess) {
    otel.start();
    otel.verifyConnection();
    // Wait for the API to be ready (it owns migrations)
    if (env.NODE_ENV === 'development') await waitForBackend(2000, 60_000);
  }

  // An app of its own: folded into the API process, the API's app takes no routes once it has answered a request.
  const app = createBaseApp();
  app.route('/:tenantId/:organizationId/mcp', mcpHandlers);
  // The token users and memberships this process caches drop when another process invalidates them.
  const stopInvalidationListener = listenForAuthInvalidation();

  const server: ServerType = serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, () => {
    baseLog.info(`MCP service listening on port ${port}${hasAiKey ? '' : ' (AI features off)'}`);
  });

  setupGracefulShutdown({
    name: 'mcp-worker',
    cleanup: async () => {
      server.close();
      await stopInvalidationListener();
      if (!options.inProcess) await otel.shutdown();
    },
    log: (msg) => baseLog.info(msg),
  });
}
