import { createServer, type Server } from 'node:http';
import { appConfig } from 'shared';
import { listenHost } from 'shared/utils/listen-host';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';
import { ensureSigningKeys } from '#/modules/oauth-server/keystore';
import { createProvider } from '#/modules/oauth-server/provider';
import { createOauthListener } from '#/modules/oauth-server/server';

let server: Server | undefined;

/**
 * The authorization server as its own process on the same public origin: the reverse proxy routes
 * `/oauth/*` here. Under singleVM the API process calls this with the oauth port and `inProcess`, and stops it with
 * `shutdownOauthWorker` from its own shutdown handler.
 */
export async function startOauthWorker(options: { port?: number; inProcess?: boolean } = {}): Promise<void> {
  if (appConfig.services.oauth.enabled === false) {
    baseLog.info('OAuth server disabled by appConfig');
    return;
  }
  const port = options.port ?? env.PORT;

  if (!options.inProcess) {
    otel.start();
    otel.verifyConnection();
    if (env.NODE_ENV === 'development') await waitForBackend({ apiPort: appConfig.devPorts.api });
  }

  await ensureSigningKeys();
  const provider = await createProvider();
  server = createServer(createOauthListener(provider));

  server.listen(port, listenHost(), () => baseLog.info(`OAuth server listening on port ${port} for ${appConfig.oauthUrl}`));

  if (!options.inProcess) {
    setupGracefulShutdown({
      name: 'oauth-worker',
      cleanup: async () => {
        shutdownOauthWorker();
        await otel.shutdown();
      },
      log: (msg) => baseLog.info(msg),
    });
  }
}

/** Closes the authorization server's listener: its own process's shutdown, and the API's cleanup under `singleVM`. */
export function shutdownOauthWorker(): void {
  server?.close();
}
