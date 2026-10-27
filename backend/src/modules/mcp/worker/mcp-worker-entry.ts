import { serve } from '@hono/node-server';
import { appConfig } from 'shared';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';
// Composition root: registers every backend module. This worker serves only the mcp routes; tool calls run through
// the module routes `#/routes` mounts.
import '#/modules';
import { mcpHandlers } from '#/modules/mcp/mcp-handlers';
import { mcpMountPath } from '#/modules/mcp/mcp-routes';
import { createBaseApp } from '#/server';

/**
 * The MCP face as its own process: the tool endpoint and its protected-resource metadata, behind tokens from the
 * authorization server. Under singleVM the API process calls this with the mcp port and `inProcess`: telemetry and the
 * wait for the API are its own.
 */
export async function startMcpWorker(options: { port?: number; inProcess?: boolean } = {}): Promise<void> {
  const port = options.port ?? env.PORT;
  if (appConfig.services.mcp.enabled === false) {
    baseLog.info('MCP server disabled by appConfig');
    return;
  }

  if (!options.inProcess) {
    otel.start();
    otel.verifyConnection();
    // Wait for the API to be ready (it owns migrations)
    if (env.NODE_ENV === 'development') await waitForBackend({ apiPort: appConfig.devPorts.api });
  }

  // An app of its own: folded into the API process, the API's app takes no routes once it has answered a request.
  const app = createBaseApp();
  app.route(mcpMountPath, mcpHandlers);

  const server = serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, () => {
    baseLog.info(`MCP service listening on port ${port}`);
  });

  setupGracefulShutdown({
    name: 'mcp-worker',
    cleanup: async () => {
      server.close();
      if (!options.inProcess) await otel.shutdown();
    },
    log: (msg) => baseLog.info(msg),
  });
}
