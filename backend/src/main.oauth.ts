import { createServer, type Server } from 'node:http';
import process from 'node:process';
import { appConfig } from 'shared';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';
import { ensureSigningKeys } from '#/modules/oauth-server/keystore';
import { createProvider } from '#/modules/oauth-server/provider';
import { createOauthListener } from '#/modules/oauth-server/server';

const port = Number(env.PORT ?? appConfig.devPorts.oauth);

/**
 * The authorization server as its own process on the same public origin (D12, D16): the reverse proxy routes
 * `/oauth/*` here.
 */
async function startOauthServer(): Promise<void> {
  if (appConfig.services.oauth.enabled === false) {
    baseLog.info('OAuth server disabled by appConfig');
    return;
  }
  otel.start();
  otel.verifyConnection();
  if (env.NODE_ENV === 'development') await waitForBackend(2000, 60_000);

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
      await otel.shutdown();
    },
    log: (msg) => baseLog.info(msg),
  });
}

startOauthServer().catch((e) => {
  process.stderr.write(`[oauth-server] Failed to start: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
