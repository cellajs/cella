import { createServer, type Server } from 'node:http';
import { appConfig } from 'shared';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';
import { ensureSigningKeys } from '#/modules/oauth-server/keystore';
import { createProvider } from '#/modules/oauth-server/provider';
import { createOauthListener } from '#/modules/oauth-server/server';

/**
 * The authorization server as its own process on the same public origin (D12, D16): the reverse proxy routes
 * `/oauth/*` here. Under singleVM the API process calls this with the oauth port and `inProcess`.
 */
export async function startOauthServer(options: { port?: number; inProcess?: boolean } = {}): Promise<void> {
  if (appConfig.services.oauth.enabled === false) {
    baseLog.info('OAuth server disabled by appConfig');
    return;
  }
  const port = options.port ?? Number(env.PORT);

  if (!options.inProcess) {
    otel.start();
    otel.verifyConnection();
    if (env.NODE_ENV === 'development') await waitForBackend(2000, 60_000);
  }

  await ensureSigningKeys();
  const provider = await createProvider();
  const server: Server = createServer(createOauthListener(provider));

  server.listen(port, '0.0.0.0', () =>
    baseLog.info(`OAuth server listening on port ${port} for ${appConfig.oauthUrl}`),
  );

  setupGracefulShutdown({
    name: 'oauth-server',
    cleanup: async () => {
      server.close();
      if (!options.inProcess) await otel.shutdown();
    },
    log: (msg) => baseLog.info(msg),
  });
}
